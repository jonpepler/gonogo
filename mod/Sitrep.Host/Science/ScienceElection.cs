using System;
using Sitrep.Contract;

namespace Sitrep.Host.Science
{
    /// <summary>
    /// The science-backend election: a deliberate mirror of
    /// <see cref="Sitrep.Host.Reliability.ReliabilityElection"/>, expressed
    /// entirely in terms of the existing <see cref="Kernel"/> with no new
    /// mechanism. ONE EXCLUSIVE capability <c>"science"</c> whose active
    /// instance is an <see cref="IScienceBackend"/>.
    ///
    /// <para>Unlike <c>ReliabilityElection</c> (which hardcodes
    /// <c>NoneReliabilityBackend</c> inline because that backend needs no live
    /// KSP), this election takes its Vanilla factory as a PARAMETER, the same
    /// shape <see cref="Sitrep.Host.ActionGroups.ActionGroupsElection"/> uses:
    /// the stock backend reads live KSP (<c>FlightGlobals.ActiveVessel</c>) so
    /// it can only be constructed from the KSP-referencing <c>Gonogo.KSP</c>
    /// assembly, not this KSP-free <c>Sitrep.Host</c> one.</para>
    ///
    /// <para>Science rides <c>Gonogo.KSP.KspHost</c>'s per-vessel capture
    /// (<c>Sample -&gt; BuildScience -&gt; Values["science"]</c>), NOT a
    /// <c>Kernel.AddSampledSource</c> channel of its own: <see cref="ScienceViewProvider"/>
    /// still reads the exact same raw dict shape at capture time, only WHO
    /// populates it (an elected backend rather than a hardcoded static
    /// call) has changed. See <c>Gonogo.KSP.ScienceUplink</c>'s doc comment
    /// for the full rationale against going full reliability-style.</para>
    /// </summary>
    public static class ScienceElection
    {
        /// <summary>The exclusive capability id every science backend competes for.</summary>
        public const string CapabilityId = "science";

        /// <summary>
        /// Registers the exclusive <c>"science"</c> capability with the stock
        /// backend as its always-present <see cref="CapabilityDescriptor.Vanilla"/>
        /// factory. Called from <c>Gonogo.KSP.ScienceUplink.DeclareCapabilities</c>
        /// (the pre-Register discovery pass, same two-pass fix as comms/
        /// action groups), so the capability exists before any provider
        /// uplink's <c>Register</c> runs.
        ///
        /// <para>Not <see cref="CapabilityDescriptor.SpineCritical"/>: an
        /// install with no science backend must not halt the whole spine,
        /// the rest of the snapshot is still perfectly good telemetry
        /// without it.</para>
        /// </summary>
        public static void RegisterCapability(
            Kernel kernel,
            Func<ProviderContext, IScienceBackend> stockVanillaFactory)
        {
            if (kernel == null) throw new ArgumentNullException(nameof(kernel));
            if (stockVanillaFactory == null) throw new ArgumentNullException(nameof(stockVanillaFactory));

            kernel.RegisterCapability(new CapabilityDescriptor
            {
                Id = CapabilityId,
                Exclusive = true,
                SpineCritical = false,
                Vanilla = ctx => stockVanillaFactory(ctx),
            });
        }

        /// <summary>
        /// Resolve the elected backend after resolution has run. Returns null
        /// if the capability was never registered/resolved (defensive, a
        /// correctly bootstrapped engine always has at least the stock
        /// vanilla backend).
        /// </summary>
        public static IScienceBackend? Elected(Kernel kernel)
        {
            if (kernel == null) throw new ArgumentNullException(nameof(kernel));
            try
            {
                return kernel.Query<IScienceBackend>(CapabilityId);
            }
            catch (Exception)
            {
                return null;
            }
        }
    }
}
