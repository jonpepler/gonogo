/*
 * What a head costs, asked the way RP-1 asks it. No compile-time reference to
 * RP0.dll, the same arm's-length reflection pattern as Rp1ScReflection, whose
 * header carries the provenance rules this file follows.
 *
 * WHY THIS EXISTS. The hire control could state a BOUND on the spend and nothing
 * else, because it had no price to multiply a headcount by. RP-1 has one, and it
 * is not on the wire.
 *
 * RP-1 STATES TWO PRICES AND CHARGES THE LOWER-PROFILE ONE, so this publishes
 * both. Read off the shipped RP-1 v4.6.0.0 RP0.dll:
 *
 *   THE CHARGE. KCTUtilities.HireStaff is the only funds deduction on the whole
 *   hiring path, and its whole money step is
 *     SpendFunds(Math.Max(0, workerAmount - Applicants) * Database.SettingsSC.HireCost, reason)
 *   SpendFunds runs NO modifier query: its body is a Funding.Instance.AddFunds of
 *   the negative amount. RP-1's Harmony prefix on AddFunds does fire
 *   OnCurrencyModifierQuery, but it adds `value` to the balance BEFORE firing and
 *   never reads the query back, so the event is a notification and not a price.
 *   The charge is therefore the RAW settings value, unmodified, and the same for
 *   both roles.
 *
 *   THE QUOTE. HireStaffProject.IncrementProgress and KCT_GUI.RenderHireFire both
 *   price a head as
 *     -CurrencyUtils.Funds(HiringEngineers|HiringResearchers, -Database.SettingsSC.HireCost)
 *   which DOES run the query. So the number on RP-1's own Hire button, and the
 *   divisor its auto-hire scheduler and its ETA divide by, is leader-modified
 *   while the charge is not.
 *
 * The two differ whenever a hiring-reason leader is active, and RP-1 ships four
 * that qualify. That is an inconsistency in RP-1, not a reading error, and it is
 * not ours to resolve: an operator told only the charge cannot reconcile our
 * figure with RP-1's own screen, and one told only the quote watches a different
 * number leave their balance. Both go on the wire, under names that say which is
 * which.
 *
 * PUBLISHING THE RAW SETTINGS VALUE IS CORRECT HERE, and that is worth saying
 * out loud because it is the shape Rp1EconomyUpkeepQuery exists to forbid. There,
 * the raw per-line costs were a SUBSTITUTE for a figure RP-1 states after its
 * modifiers, so publishing them made the parts disagree with the total. Here the
 * raw value is not a substitute for anything: it is what leaves the balance, and
 * the modified figure is published beside it rather than instead of it.
 *
 * MAIN THREAD, WHICH IS WHY THE QUOTE HALF IS GATED AT ALL. CurrencyUtils.Funds
 * runs CurrencyModifierQueryRP0.RunQuery, which FIRES
 * GameEvents.Modifiers.OnCurrencyModifierQuery at every modifier in the save.
 * This runs inside Rp1ScUplink.CaptureOnMain, which is a main-thread capture, so
 * the thread is right; the cadence is not. Unthrottled it would broadcast twice
 * per physics frame forever, so the two queries are asked only when their answer
 * can have changed.
 *
 * NO COURIER HANDOFF, WHICH IS THE ONE PLACE THIS DEPARTS FROM
 * Rp1EconomyUpkeepQuery. That class needs a volatile publish because its consumer
 * is a DIFFERENT topic's mapper, running on the Courier thread. This one's
 * consumer is the same capture's own payload: the prices are stashed on Rp1ScRaw
 * and cross the seam as plain data with everything else the walk produced, so
 * there is nothing to order and nothing to publish.
 *
 * THE CHANGE-GATE CANNOT BE COPIED FROM THE UPKEEP ONE, and the reason is the
 * interesting part. That gate watches MaintenanceHandler.UpkeepPerDayForDisplay,
 * which RP-1 rebuilds from the same six queries whenever a leader changes, so
 * watching RP-1's own answer is watching the modifiers without asking them. There
 * is no such number for a hire: RP-1 recomputes the price inline every tick and
 * stores it nowhere, and SettingsSC.HireCost does not move when a leader is
 * appointed. A gate on the inputs alone would therefore price once at load and
 * never again, and never see a leader at all.
 *
 * So the gate watches WHO IS LISTENING instead. RP0.Leaders.CurrencyModifier is
 * the only subscriber to OnCurrencyModifierQuery in the whole assembly, and it
 * adds itself in OnRegister and removes itself in OnUnregister, which run with a
 * strategy's activation. Its multiplier is a [Persistent] config field and is NOT
 * scaled by Strategy.Factor, so the set of ACTIVE strategies is the complete
 * statement of what the query will answer. A leader appointed or dismissed
 * therefore re-prices on the very next capture.
 *
 * AND A FLOOR UNDER IT, for the listeners that set cannot describe. Any mod may
 * subscribe to OnCurrencyModifierQuery, and one that did would move the quote
 * with nothing in the gate to show it, so the answer would be wrong forever
 * rather than briefly. The floor re-prices once an in-game hour regardless, which
 * is MaintenanceHandler's own UpdateInterval and so the same staleness the upkeep
 * lines already carry.
 */
using System;
using Sitrep.Contract;

namespace GonogoRp1Uplink
{
    /// <summary>
    /// What one head costs: the figure RP-1 charges, and the figures it quotes.
    /// Plain data with no live RP-1 object in it, so it can ride the capture's
    /// return value across the seam.
    /// </summary>
    public sealed class Rp1HirePrices
    {
        /// <summary>
        /// What a PAID head actually costs, unmodified, both roles. Null when
        /// RP-1's settings could not be read.
        /// </summary>
        public double? Charge;

        /// <summary>
        /// What RP-1 quotes for an engineer, after its own modifiers. Null when
        /// the query could not be asked, which leaves <see cref="Charge"/>
        /// standing on its own rather than substituting for it.
        /// </summary>
        public double? EngineerQuote;

        /// <summary>What RP-1 quotes for a researcher, on the same terms.</summary>
        public double? ResearcherQuote;
    }

    /// <summary>
    /// Asks RP-1 what a head costs, on the main thread, only when the answer can
    /// have moved.
    /// </summary>
    public sealed class Rp1HirePriceQuery
    {
        private const string DatabaseTypeName = "RP0.Database";
        private const string CurrencyUtilsTypeName = "RP0.CurrencyUtils";
        private const string TransactionReasonsTypeName = "RP0.TransactionReasonsRP0";
        private const string StrategySystemTypeName = "Strategies.StrategySystem";

        /// <summary>RP-1's own reason per role, and the only two on this path.</summary>
        private const string EngineerReason = "HiringEngineers";
        private const string ResearcherReason = "HiringResearchers";

        /// <summary>
        /// How long an unchanged answer is trusted, in game seconds.
        /// MaintenanceHandler.UpdateInterval, so a quote is never staler than the
        /// upkeep lines beside it.
        /// </summary>
        private const double RepriceIntervalUt = 3600.0;

        /// <summary>
        /// The BROADCASTS, not the captures, because the broadcast is the cost:
        /// each query fires OnCurrencyModifierQuery at every modifier in the save.
        /// Steady state is two per in-game hour, so anything near this threshold
        /// means the change-gate stopped gating rather than that a career got
        /// busy.
        /// </summary>
        private static readonly PerfBudget HireQueryBudget = new PerfBudget(
            "Rp1HirePriceQuery currency queries", threshold: 10, windowSec: 1.0, unit: "queries");

        private readonly Type? _database;
        private readonly Type? _currencyUtils;
        private readonly Type? _transactionReasons;
        private readonly Type? _strategySystem;
        private readonly System.Reflection.MethodInfo? _funds;

        private Rp1HirePrices? _cached;
        private bool _primed;
        private double? _lastCharge;
        private long _lastListeners;
        private double _lastPricedUt;

        public Rp1HirePriceQuery()
        {
            _database = Rp1Types.Find(DatabaseTypeName);
            _currencyUtils = Rp1Types.Find(CurrencyUtilsTypeName);
            _transactionReasons = Rp1Types.Find(TransactionReasonsTypeName);
            _strategySystem = Rp1Types.Find(StrategySystemTypeName);
            if (_currencyUtils != null)
            {
                // Arity 3: RP-1's own callers use the two-argument form, which is
                // this one with includeHidden defaulted. A reflected call supplies
                // no defaults, so the flag is passed explicitly below.
                _funds = Rp1Types.StaticMethod(_currencyUtils, "Funds", 3);
            }
        }

        /// <summary>
        /// Whether the CHARGE can be read. The quotes have their own condition and
        /// their own null, because the charge is the figure that leaves the balance
        /// and it needs no query at all.
        /// </summary>
        public bool IsAvailable => _database != null;

        /// <summary>
        /// MAIN-THREAD capture. Returns the prices as plain data, asking RP-1's
        /// query only when a leader, the settings value or the hour has moved.
        /// </summary>
        public Rp1HirePrices? CaptureOnMain(double ut)
        {
            if (!IsAvailable)
            {
                return null;
            }

            var charge = Rp1Types.ReadDouble(
                Rp1Types.StaticValue(_database!, "SettingsSC"), "HireCost");
            if (charge == null)
            {
                // RP-1's type is present and its settings are not, so there is no
                // price to state. Cleared rather than held: the next save that
                // does have settings must not inherit this one's price.
                _primed = false;
                _cached = null;
                return null;
            }

            var listeners = ListenerSignature();
            if (!Moved(charge, listeners, ut))
            {
                return _cached;
            }

            _cached = new Rp1HirePrices
            {
                Charge = charge,
                EngineerQuote = Quote(EngineerReason, charge.Value, ut),
                ResearcherQuote = Quote(ResearcherReason, charge.Value, ut),
            };
            _lastPricedUt = ut;
            return _cached;
        }

        /// <summary>
        /// Whether anything the answers depend on has moved, recording the current
        /// state either way.
        /// </summary>
        /// <remarks>
        /// The UT test is deliberately two-sided. A revert or a reload moves UT
        /// BACKWARDS, and a forward-only difference would then stop firing for as
        /// long as the clock sat behind the point it had already reached, which is
        /// the whole of a rehearsal.
        /// </remarks>
        private bool Moved(double? charge, long listeners, double ut)
        {
            var moved = !_primed
                || charge != _lastCharge
                || listeners != _lastListeners
                || ut < _lastPricedUt
                || ut - _lastPricedUt >= RepriceIntervalUt;
            _primed = true;
            _lastCharge = charge;
            _lastListeners = listeners;
            return moved;
        }

        /// <summary>
        /// A fold over the names of the ACTIVE strategies, which is the set of
        /// modifiers that will answer the next query.
        /// </summary>
        /// <remarks>
        /// Names rather than a count, because a swap of one leader for another
        /// leaves the count alone and changes the answer. Order-dependent, because
        /// RP-1's list order is stable and a stricter signature costs nothing here
        /// while a collision holding two different leader sets to one value would
        /// freeze the price.
        ///
        /// <para>A save with no strategy system, and a save with no leader
        /// appointed, both fold to the bare basis. That conflation is deliberate
        /// and safe: an install where the type will not resolve has no signature to
        /// offer, and what covers it is the hour floor rather than this.</para>
        /// </remarks>
        private long ListenerSignature()
        {
            var signature = unchecked((long)14695981039346656037UL);
            if (_strategySystem == null)
            {
                return signature;
            }
            var system = Rp1Types.StaticValue(_strategySystem, "Instance");
            if (system == null)
            {
                return signature;
            }

            foreach (var strategy in Rp1Types.Enumerate(Rp1Types.Member(system, "Strategies")))
            {
                if (Rp1Types.ReadBool(strategy, "IsActive") != true)
                {
                    continue;
                }
                // The separator matters: without one, two adjacent names fold to
                // the same value as their concatenation split anywhere else.
                signature = unchecked((signature ^ ' ') * 1099511628211L);
                foreach (var c in Rp1Types.ReadString(strategy, "Name") ?? "")
                {
                    signature = unchecked((signature ^ c) * 1099511628211L);
                }
            }
            return signature;
        }

        /// <summary>
        /// What RP-1 QUOTES for one head of this role. Null when the query cannot
        /// be asked, which costs the quote and leaves the charge standing: a charge
        /// republished under a quote's name is the substitution this file's header
        /// forbids.
        /// </summary>
        /// <remarks>
        /// Negated on the way in and back out because that is how RP-1 asks it. The
        /// query is about a transaction, and a transaction that costs money is a
        /// negative one.
        /// </remarks>
        private double? Quote(string reason, double charge, double ut)
        {
            if (_funds == null || _transactionReasons == null)
            {
                return null;
            }
            try
            {
                HireQueryBudget.Record(1.0, ut);
                var parsed = Enum.Parse(_transactionReasons, reason);
                var delta = Rp1Types.ToDouble(
                    _funds.Invoke(null, new object[] { parsed, -charge, false }));
                return delta == null ? (double?)null
                    // Zero stays zero rather than becoming a negative one, which
                    // survives JSON and prints as "-0".
                    : delta.Value == 0.0 ? 0.0
                    : -delta.Value;
            }
            catch (Exception)
            {
                return null;
            }
        }
    }
}
