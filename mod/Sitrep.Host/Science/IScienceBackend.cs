using System.Collections.Generic;
using Sitrep.Contract;

namespace Sitrep.Host.Science
{
    /// <summary>
    /// The science capability seam: the same shape
    /// <see cref="Sitrep.Host.ActionGroups.IActionGroupsBackend"/> established
    /// for action groups, and for the same reason - ONE client interface,
    /// SWAPPABLE authority. Mirrors <c>Gonogo.KSP.ReliabilityCoreUplink</c>'s
    /// election precedent: core registers an always-present vanilla factory
    /// for an exclusive capability, and the read path resolves the winner at
    /// CAPTURE time.
    ///
    /// <para>Each method returns the same raw <c>List&lt;object?&gt;?</c>
    /// dictionary shape <see cref="ScienceViewProvider"/> already consumes off
    /// <c>Values["science"][key]</c> - deliberately untyped for THIS session
    /// (typed <c>Sitrep.Contract</c> POCOs are the out-of-scope follow-on, the
    /// same posture <see cref="ScienceViewProvider"/>'s own doc comment
    /// documents). Null is the contract's documented "nothing to report this
    /// tick", never an empty list.</para>
    ///
    /// <para><b>Threading: read this before adding a backend.</b> Unlike a
    /// <see cref="Sitrep.Host"/> view-provider (which maps an ALREADY-captured
    /// <see cref="KspSnapshot"/> and may run on the Courier thread), an
    /// implementation of this interface reads LIVE KSP. It is therefore only
    /// ever called from the main-thread capture (<c>Gonogo.KSP.KspHost</c>'s
    /// <c>BuildScience</c>), the same main-thread seam
    /// <c>IActionGroupsBackend</c> uses. Never call a backend from a channel-
    /// source closure.</para>
    /// </summary>
    public interface IScienceBackend
    {
        /// <summary>Identifies which backend answered - diagnostic/health use, mirroring the other elected backends' shape.</summary>
        string BackendId { get; }

        /// <summary>Per-<c>ScienceData</c> onboard experiment/container rows. See <c>Gonogo.KSP.StockScienceBackend.Experiments</c> for the stock walk this lifts verbatim.</summary>
        List<object?>? Experiments();

        /// <summary>Per-<c>ModuleScienceExperiment</c> instrument inventory. See <c>Gonogo.KSP.StockScienceBackend.Instruments</c>.</summary>
        List<object?>? Instruments();

        /// <summary>Per-<c>ModuleEnviroSensor</c> readouts. See <c>Gonogo.KSP.StockScienceBackend.Sensors</c>.</summary>
        List<object?>? Sensors();

        /// <summary>Per-<c>ModuleScienceLab</c> processing state. See <c>Gonogo.KSP.StockScienceBackend.Lab</c>.</summary>
        List<object?>? Lab();

        /// <summary>Per-subject rollup of the same stored science data. See <c>Gonogo.KSP.StockScienceBackend.ExperimentBreakdown</c>.</summary>
        List<object?>? ExperimentBreakdown();
    }
}
