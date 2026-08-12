#if NETSTANDARD2_0
using Reinforced.Typings.Attributes;
#endif
using Sitrep.Contract;

namespace Gonogo.RealAntennasUplink;

// ====================================================================
// The RealAntennas-ONLY half of the comms.* wire contract, extracted from
// mod/Sitrep.Contract/Comms.cs (uplink-types-out-of-core plan, seventh and
// last step). The shared half stays there, and the split is not arbitrary:
// Comms.cs's own header describes a PROVIDER axis, where the elected backend
// (stock CommNet, or this Uplink's RaCommsBackend) sources the shared
// channels, and a private set only this Uplink can source. These three are
// that private set, declared in RealAntennasUplink.Manifest and published by
// RealAntennasUplink.HandleOnCourier: nothing else in the mod can produce
// them, and without this Uplink installed they simply never emit.
//
// TRUE-NOW like every other comms.* channel: they describe the link AS KSC
// SEES IT, computed ground-side.
//
// R7 discipline, inherited unchanged: every payload carries PayloadMeta;
// absence is a nullable (T?), never a NaN/0/-1 sentinel.
//
// The wire FORMAT of all three is byte-for-byte what it was in core. What
// changed is which assembly declares the names, plus who writes the bytes:
// core's JsonWriter used to carry a hand-written case per type, and now
// RaWire flattens them producer-side (the same self-flattening pattern the
// rest of this codebase's publishers use), so core no longer needs to know
// these types exist at all. That is the whole point of the relocation, and
// it is why this slice, unlike its predecessors, had to touch the serializer.
// ====================================================================

/// <summary>
/// The <c>comms.linkQuality</c> payload: RealAntennas-ONLY (absent without
/// RA). Link margin normalised to 0..1 (comms-uplink-design.md §2.2/§4.3).
/// </summary>
[SitrepContract]
#if NETSTANDARD2_0
[TsInterface]
#endif
[SitrepTopic("comms.linkQuality")]
public class CommsLinkQuality
{
    [SitrepUnit(Units.Ratio)]
    public double Value { get; set; }
    public PayloadMeta Meta { get; set; } = new();
}

/// <summary>
/// The <c>comms.dataRate</c> payload: RealAntennas-ONLY. Bidirectional link
/// data rate in bits/sec, read live per-hop off the RA CommNet graph
/// (comms-uplink-design.md §4.3: "reachable cleanly").
/// </summary>
[SitrepContract]
#if NETSTANDARD2_0
[TsInterface]
#endif
[SitrepTopic("comms.dataRate")]
public class CommsDataRate
{
    [SitrepUnit(Units.BitsPerSecond)]
    public double UpBitsPerSec { get; set; }
    [SitrepUnit(Units.BitsPerSecond)]
    public double DownBitsPerSec { get; set; }
    public PayloadMeta Meta { get; set; } = new();
}

/// <summary>
/// The <c>comms.linkMargin</c> payload: RealAntennas-ONLY. Re-derived by the
/// RealAntennas uplink from RA's public static link-budget math, NOT read off
/// a live field (comms-uplink-design.md §4.3: margin is computed transiently
/// inside RA's internal Precompute job and not stored anywhere public).
/// </summary>
[SitrepContract]
#if NETSTANDARD2_0
[TsInterface]
#endif
[SitrepTopic("comms.linkMargin")]
public class CommsLinkMargin
{
    [SitrepUnit(Units.Decibels)]
    public double DecibelMargin { get; set; }
    [SitrepUnit(Units.Flag)]
    public bool ClosesLink { get; set; }
    public PayloadMeta Meta { get; set; } = new();
}

/// <summary>
/// RealAntennas' namespace of a <c>CommsHop</c>'s provider extension bag: the
/// per-hop RA facts core's shared <c>CommsHop</c> shape does not (and should
/// not) declare, carried under the provider id <c>"realantennas"</c> and typed
/// HERE rather than in core (see <c>Sitrep.Contract/ProviderExtensions.cs</c>
/// for the mechanism, and a sibling Uplink's reliability extension for the
/// exemplar).
///
/// <para>It rides <c>comms.path</c>, which is already the TrueNow geometry
/// SignalDelay consumes, so every field here is TrueNow like the rest of the
/// comms family: these are properties of the link KSC is computing right now,
/// several of them (data rate) parallel to the delay computation, so
/// delay-gating them would be circular.</para>
///
/// <para>Every field is nullable: absent under bare CommNet (the vanilla
/// backend leaves the whole bag null), and individually absent when a
/// particular RA read fails, the same typed-absence posture as the rest of this
/// slice. Read client-side through <c>readRealAntennasHopExt</c>, never by
/// reaching into <c>hop.extensions?.realantennas</c> and casting.</para>
/// </summary>
[SitrepContract]
#if NETSTANDARD2_0
[TsInterface]
#endif
public class RealAntennasHopExt
{
    /// <summary>RF band the hop is on (L/S/X/K): <c>RealAntenna.RFBand.name</c>.</summary>
    [SitrepUnit(Units.Text)]
    public string? Band { get; set; }

    /// <summary>Antenna tech level (0..9): the progression axis behind the rate ceiling.</summary>
    [SitrepUnit(Units.Count)]
    public int? TechLevel { get; set; }

    /// <summary>Negotiated modulation order: shows the link stepping down under a thin margin.</summary>
    [SitrepUnit(Units.Count)]
    public int? ModulationBits { get; set; }

    /// <summary>Active FEC encoder name (e.g. "Reed-Solomon 255/223", "Turbo 1/2").</summary>
    [SitrepUnit(Units.Text)]
    public string? Encoder { get; set; }

    /// <summary>Encoder coding rate (0..1): the FEC overhead the rate already includes.</summary>
    [SitrepUnit(Units.Ratio)]
    public double? CodingRate { get; set; }

    /// <summary>Required Eb/N0 (dB) to close the link at this encoder: RA's own figure.</summary>
    [SitrepUnit(Units.Decibels)]
    public double? RequiredEbN0 { get; set; }

    /// <summary>Dish beamwidth (degrees): pointing tightness/sensitivity.</summary>
    [SitrepUnit(Units.Degrees)]
    public double? Beamwidth { get; set; }

    /// <summary>Transmit electric-charge draw (units/s): the comms power cost of this hop.</summary>
    [SitrepUnit(Units.ResourceUnitsPerSecond)]
    public double? PowerDrawEc { get; set; }

    /// <summary>
    /// Reverse-direction throughput (bits/sec): the opposite of the shared
    /// <c>CommsHop.BandRateBitsPerSec</c> forward rate, off the same live
    /// RACommLink. The backend only surfaced the forward pair before.
    /// </summary>
    [SitrepUnit(Units.BitsPerSecond)]
    public double? ReverseBitsPerSec { get; set; }
}
