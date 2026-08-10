using System;
using System.Collections.Generic;
using Sitrep.Host.Science;
using UnityEngine;

namespace Gonogo.KSP
{
    /// <summary>
    /// The always-present VANILLA science backend: the structural counterpart
    /// to <see cref="StockActionGroupsBackend"/>, registered as the
    /// <c>"science"</c> capability's <c>Vanilla</c> factory by
    /// <see cref="ScienceUplink.DeclareCapabilities"/>. Lifted verbatim from
    /// <see cref="KspHost"/>'s former private
    /// <c>BuildScienceExperiments/BuildScienceInstruments/BuildScienceSensors/
    /// BuildScienceLab/BuildScienceExperimentBreakdown</c> (+
    /// <c>BuildScienceDataEntry</c> helper) - only the vessel source changed,
    /// from a <c>Vessel</c> parameter to reading
    /// <see cref="FlightGlobals.ActiveVessel"/> internally, the same shape
    /// <see cref="StockActionGroupsBackend"/> uses.
    ///
    /// <para>Deployed (Breaking Ground) science is NOT part of this backend:
    /// it is captured globally across every loaded vessel, not scoped to the
    /// active vessel, and stays a direct call in <c>KspHost.BuildScience</c>
    /// (<c>BuildDeployedScience</c>) - see that method's own doc comment.</para>
    ///
    /// <para><b>Main thread only</b>: every method reads live KSP
    /// (<c>FlightGlobals.ActiveVessel</c>). See
    /// <see cref="IScienceBackend"/>'s threading note: this is called from
    /// <see cref="KspHost"/>'s main-thread capture, never from a channel-
    /// source closure.</para>
    /// </summary>
    public sealed class StockScienceBackend : IScienceBackend
    {
        public string BackendId => "stock";

        /// <summary>
        /// Per-subject rollup of the same stored <see cref="ScienceData"/>
        /// <see cref="Experiments"/> lists one-row-per-blob: re-walks the
        /// vessel's experiment/container modules independently rather than
        /// reusing <see cref="Experiments"/>'s output, mirroring this group's
        /// existing "one independent walk per sub-group" convention
        /// (<see cref="Lab"/>/<see cref="Sensors"/>/<see cref="Instruments"/>
        /// are likewise separate walks, not derived from each other).
        /// <c>biome</c>/<c>situation</c> come from
        /// <c>ScienceUtil.GetExperimentFieldsFromScienceID</c> (confirmed via
        /// decompile: public static, splits the subject id APART rather than
        /// re-deriving from the vessel's CURRENT position, so a subject
        /// collected earlier in the flight keeps its own original biome/
        /// situation). <c>remainingPotential</c> is the ABSOLUTE science left
        /// in the subject (<c>ScienceSubject.scienceCap - science</c>, via
        /// <c>ResearchAndDevelopment.GetSubjectByID</c>): <c>0</c> outside
        /// Career/Science mode, where <c>ResearchAndDevelopment.Instance</c> is
        /// null. One entry per DISTINCT subject id; multiple stored blobs for
        /// the same subject collapse into one entry with <c>dataMits</c>
        /// summed. Null when the vessel carries no stored science data at all,
        /// never an empty list (same convention <see cref="Experiments"/>
        /// uses).
        /// </summary>
        public List<object?>? ExperimentBreakdown()
        {
            var vessel = FlightGlobals.ActiveVessel;
            if (vessel == null)
            {
                return null;
            }

            var parts = vessel.parts;
            if (parts == null || parts.Count == 0)
            {
                return null;
            }

            var bySubject = new Dictionary<string, (string title, double dataMits)>();
            var order = new List<string>();

            void Accumulate(ScienceData data)
            {
                var subjectId = data.subjectID;
                if (string.IsNullOrEmpty(subjectId))
                {
                    return;
                }

                if (bySubject.TryGetValue(subjectId, out var running))
                {
                    bySubject[subjectId] = (running.title, running.dataMits + data.dataAmount);
                }
                else
                {
                    bySubject[subjectId] = (data.title, data.dataAmount);
                    order.Add(subjectId);
                }
            }

            foreach (var part in parts)
            {
                if (part == null || part.Modules == null)
                {
                    continue;
                }

                var experiments = part.Modules.GetModules<ModuleScienceExperiment>();
                if (experiments != null)
                {
                    foreach (var exp in experiments)
                    {
                        if (exp == null)
                        {
                            continue;
                        }

                        ScienceData[]? data;
                        try { data = exp.GetData(); } catch { data = null; }
                        if (data == null)
                        {
                            continue;
                        }

                        foreach (var d in data)
                        {
                            if (d != null)
                            {
                                Accumulate(d);
                            }
                        }
                    }
                }

                var containers = part.Modules.GetModules<ModuleScienceContainer>();
                if (containers != null)
                {
                    foreach (var container in containers)
                    {
                        if (container == null)
                        {
                            continue;
                        }

                        ScienceData[]? data;
                        try { data = container.GetData(); } catch { data = null; }
                        if (data == null)
                        {
                            continue;
                        }

                        foreach (var d in data)
                        {
                            if (d != null)
                            {
                                Accumulate(d);
                            }
                        }
                    }
                }
            }

            if (order.Count == 0)
            {
                return null;
            }

            var list = new List<object?>();
            foreach (var subjectId in order)
            {
                var (title, dataMits) = bySubject[subjectId];
                ScienceUtil.GetExperimentFieldsFromScienceID(subjectId, out _, out string situation, out string biome);

                var remainingPotential = 0.0;
                if (ResearchAndDevelopment.Instance != null)
                {
                    var subject = ResearchAndDevelopment.GetSubjectByID(subjectId);
                    if (subject != null)
                    {
                        remainingPotential = (double)(subject.scienceCap - subject.science);
                    }
                }

                list.Add(new Dictionary<string, object?>
                {
                    ["subjectId"] = subjectId,
                    ["biome"] = biome,
                    ["situation"] = situation,
                    ["expTitle"] = title,
                    ["dataMits"] = dataMits,
                    ["remainingPotential"] = remainingPotential,
                });
            }

            return list;
        }

        /// <summary>
        /// One entry per <see cref="ScienceData"/> currently held by any
        /// <see cref="ModuleScienceExperiment"/> (data collected in the
        /// experiment itself, not yet transferred - <c>location:
        /// "experiment"</c>) or <see cref="ModuleScienceContainer"/> (data
        /// already collected into an onboard container - <c>location:
        /// "container"</c>) on the vessel. Both classes expose a public
        /// <c>GetData()</c> directly (confirmed via decompile) - called on
        /// the concrete type rather than through <c>IScienceDataContainer</c>
        /// (that interface decompiled with no visible members, so nothing is
        /// assumed about it). Null when the vessel carries no science data
        /// at all, never an empty list.
        /// </summary>
        public List<object?>? Experiments()
        {
            var vessel = FlightGlobals.ActiveVessel;
            if (vessel == null)
            {
                return null;
            }

            var parts = vessel.parts;
            if (parts == null || parts.Count == 0)
            {
                return null;
            }

            List<object?>? list = null;
            var situation = vessel.situation.ToString();

            foreach (var part in parts)
            {
                if (part == null || part.Modules == null)
                {
                    continue;
                }

                var partName = part.partInfo != null ? part.partInfo.title : part.name;

                var experiments = part.Modules.GetModules<ModuleScienceExperiment>();
                if (experiments != null)
                {
                    foreach (var exp in experiments)
                    {
                        if (exp == null)
                        {
                            continue;
                        }

                        ScienceData[]? data;
                        try { data = exp.GetData(); } catch { data = null; }
                        if (data == null)
                        {
                            continue;
                        }

                        foreach (var d in data)
                        {
                            if (d == null)
                            {
                                continue;
                            }
                            list ??= new List<object?>();
                            list.Add(BuildScienceDataEntry(d, partName, situation, "experiment", exp.experimentID, exp.Deployed, exp.Inoperable));
                        }
                    }
                }

                var containers = part.Modules.GetModules<ModuleScienceContainer>();
                if (containers != null)
                {
                    foreach (var container in containers)
                    {
                        if (container == null)
                        {
                            continue;
                        }

                        ScienceData[]? data;
                        try { data = container.GetData(); } catch { data = null; }
                        if (data == null)
                        {
                            continue;
                        }

                        foreach (var d in data)
                        {
                            if (d == null)
                            {
                                continue;
                            }
                            list ??= new List<object?>();
                            list.Add(BuildScienceDataEntry(d, partName, situation, "container", null, null, null));
                        }
                    }
                }
            }

            return list;
        }

        private static Dictionary<string, object?> BuildScienceDataEntry(ScienceData data, string partName, string situation, string location, string? experimentId, bool? deployed, bool? inoperable)
        {
            return new Dictionary<string, object?>
            {
                ["partName"] = partName,
                // "experiment" = still sitting in the experiment module,
                // uncollected; "container" = already collected into an
                // onboard ModuleScienceContainer. KSP doesn't track a
                // separate "already transmitted" flag on ScienceData itself
                // (transmission is a fire-and-forget action, not persisted
                // state) - the consumer reads location as the closest
                // available "stored vs not yet collected" signal.
                ["location"] = location,
                ["experimentId"] = experimentId,
                ["subjectId"] = data.subjectID,
                ["title"] = data.title,
                ["dataAmount"] = (double)data.dataAmount,
                ["scienceValueRatio"] = (double)data.scienceValueRatio,
                ["baseTransmitValue"] = (double)data.baseTransmitValue,
                ["transmitBonus"] = (double)data.transmitBonus,
                ["labValue"] = (double)data.labValue,
                ["deployed"] = deployed,
                ["inoperable"] = inoperable,
                ["situation"] = situation,
            };
        }

        /// <summary>
        /// One entry per <see cref="ModuleScienceExperiment"/> on the active
        /// vessel, captured as an INVENTORY / operability list keyed by the
        /// part's <c>flightID</c> - distinct from <see cref="Experiments"/>,
        /// which walks the same modules but emits one row per STORED
        /// <see cref="ScienceData"/> result (a module holding no data
        /// produces no row there). This list emits a row for EVERY
        /// experiment module regardless of whether it currently holds data,
        /// so the operator can see what instruments are aboard and their
        /// deploy/inoperable/rerunnable/resettable/collectable state. All five
        /// booleans and <c>experimentID</c> are public fields on
        /// <see cref="ModuleScienceExperiment"/> (confirmed via decompile);
        /// <c>title</c> is the linked <c>ScienceExperiment.experimentTitle</c>,
        /// read defensively since the definition can be lazily unresolved.
        /// Null when the vessel carries no experiment modules at all, never an
        /// empty list.
        /// </summary>
        public List<object?>? Instruments()
        {
            var vessel = FlightGlobals.ActiveVessel;
            if (vessel == null)
            {
                return null;
            }

            var parts = vessel.parts;
            if (parts == null || parts.Count == 0)
            {
                return null;
            }

            List<object?>? list = null;

            foreach (var part in parts)
            {
                if (part == null || part.Modules == null)
                {
                    continue;
                }

                var partName = part.partInfo != null ? part.partInfo.title : part.name;
                var partId = part.flightID != 0 ? part.flightID.ToString() : null;

                var experiments = part.Modules.GetModules<ModuleScienceExperiment>();
                if (experiments == null)
                {
                    continue;
                }

                foreach (var exp in experiments)
                {
                    if (exp == null)
                    {
                        continue;
                    }

                    string? title = null;
                    try { title = exp.experiment != null ? exp.experiment.experimentTitle : null; }
                    catch { title = null; }

                    list ??= new List<object?>();
                    list.Add(new Dictionary<string, object?>
                    {
                        ["partId"] = partId,
                        ["partName"] = partName,
                        ["experimentId"] = exp.experimentID,
                        ["title"] = title,
                        ["deployed"] = exp.Deployed,
                        ["inoperable"] = exp.Inoperable,
                        ["rerunnable"] = exp.rerunnable,
                        ["resettable"] = exp.resettable,
                        ["dataIsCollectable"] = exp.dataIsCollectable,
                    });
                }
            }

            return list;
        }

        /// <summary>
        /// One entry per <see cref="ModuleEnviroSensor"/> (thermometer,
        /// barometer, gravioli detector, accelerometer, and any modded sensor
        /// sharing the module) on the active vessel. A GENERAL sensor group -
        /// one entry per module, <c>type</c> carrying the raw
        /// <see cref="SensorType"/> enum name as a string - NOT four fixed
        /// temp/pres/grav/acc keys, so modded sensor types and multiple
        /// instances of the same type both fall out naturally. Verified public
        /// members (via decompile): <c>sensorType</c> (SensorType enum),
        /// <c>readoutInfo</c> (string, the live readout, "Off" when inactive),
        /// <c>sensorActive</c> (bool). Null when the vessel carries no sensor
        /// module at all, never an empty list (same "omit entirely" convention
        /// <see cref="Experiments"/> uses).
        /// </summary>
        public List<object?>? Sensors()
        {
            var vessel = FlightGlobals.ActiveVessel;
            if (vessel == null)
            {
                return null;
            }

            var parts = vessel.parts;
            if (parts == null || parts.Count == 0)
            {
                return null;
            }

            List<object?>? list = null;

            foreach (var part in parts)
            {
                if (part == null || part.Modules == null)
                {
                    continue;
                }

                var partName = part.partInfo != null ? part.partInfo.title : part.name;
                // Same flightID join key as the power/robotics captures - see
                // KspHost.BuildPartsPower's comment. 0 is the uninitialized sentinel.
                var partId = part.flightID != 0 ? part.flightID.ToString() : null;

                var sensors = part.Modules.GetModules<ModuleEnviroSensor>();
                if (sensors == null)
                {
                    continue;
                }

                foreach (var sensor in sensors)
                {
                    if (sensor == null)
                    {
                        continue;
                    }
                    list ??= new List<object?>();
                    list.Add(new Dictionary<string, object?>
                    {
                        ["partId"] = partId,
                        ["partName"] = partName,
                        ["type"] = sensor.sensorType.ToString(),
                        ["readout"] = sensor.readoutInfo,
                        ["active"] = sensor.sensorActive,
                    });
                }
            }

            return list;
        }

        /// <summary>
        /// One entry per <see cref="ModuleScienceLab"/> (MPL) on the vessel.
        /// <c>scienceRate</c> comes from <c>ModuleScienceConverter.
        /// CalculateScienceRate(dataStored)</c> via the lab's public
        /// <c>Converter</c> property (confirmed via decompile) - wrapped in
        /// its own try since a lab with no converter configured is a valid
        /// (if unusual) part config. <c>scientistCount</c> counts
        /// <c>part.protoModuleCrew</c> entries whose <c>trait == "Scientist"</c>
        /// (both confirmed via decompile - <c>Part.protoModuleCrew</c> is a
        /// public field, <c>ProtoCrewMember.trait</c> a public string).
        /// </summary>
        public List<object?>? Lab()
        {
            var vessel = FlightGlobals.ActiveVessel;
            if (vessel == null)
            {
                return null;
            }

            var parts = vessel.parts;
            if (parts == null || parts.Count == 0)
            {
                return null;
            }

            List<object?>? list = null;

            foreach (var part in parts)
            {
                if (part == null || part.Modules == null)
                {
                    continue;
                }

                var labs = part.Modules.GetModules<ModuleScienceLab>();
                if (labs == null)
                {
                    continue;
                }

                foreach (var lab in labs)
                {
                    if (lab == null)
                    {
                        continue;
                    }

                    var partName = part.partInfo != null ? part.partInfo.title : part.name;

                    double? rate = null;
                    try
                    {
                        var converter = lab.Converter;
                        if (converter != null)
                        {
                            rate = converter.CalculateScienceRate(lab.dataStored);
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.LogWarning("[Gonogo] science.lab rate read failed on \"" + partName + "\", omitting: " + ex);
                    }

                    var scientistCount = 0;
                    var crew = part.protoModuleCrew;
                    if (crew != null)
                    {
                        foreach (var kerbal in crew)
                        {
                            if (kerbal != null && kerbal.trait == "Scientist")
                            {
                                scientistCount++;
                            }
                        }
                    }

                    bool? isOperational = null;
                    try { isOperational = lab.IsOperational(); } catch { isOperational = null; }

                    list ??= new List<object?>();
                    list.Add(new Dictionary<string, object?>
                    {
                        ["partName"] = partName,
                        ["dataStored"] = (double)lab.dataStored,
                        ["dataStorage"] = (double)lab.dataStorage,
                        ["storedScience"] = (double)lab.storedScience,
                        ["processingData"] = lab.processingData,
                        ["statusText"] = lab.statusText,
                        ["scientistCount"] = scientistCount,
                        ["scienceRate"] = rate,
                        ["isOperational"] = isOperational,
                    });
                }
            }

            return list;
        }
    }
}
