using System;
using System.Threading;
using GonogoRp1Uplink;
using RP0;
using Strategies;
using Xunit;

namespace GonogoRp1Uplink.Tests
{
    /// <summary>
    /// What a head costs, and the cadence at which RP-1 is asked.
    /// </summary>
    /// <remarks>
    /// The two halves this pins are the two RP-1 disagrees with itself about: the
    /// figure it CHARGES (raw settings value, applicants netted off at the till)
    /// and the figure it QUOTES on its own Hire button (the same value through
    /// CurrencyUtils.Funds, so leader-modified). Publishing one as the other is
    /// the defect these tests exist to prevent in both directions.
    ///
    /// <para>The cadence half matters because the quote is a BROADCAST: each ask
    /// fires OnCurrencyModifierQuery at every modifier in the save. The gate below
    /// is the only thing between two asks an in-game hour and two every physics
    /// frame.</para>
    /// </remarks>
    [Collection("rp0-static-graph")]
    public class Rp1HirePriceQueryTests : IDisposable
    {
        private static int _sequence;

        /// <summary>
        /// A distinct instant per test, and not a decoration. The query's
        /// PerfBudget is static and its window is in GAME seconds, so a suite
        /// that priced everything at UT zero would pile every test's queries
        /// into one window and have the budget warn about a capture that is
        /// behaving perfectly. Production never sees that, because UT advances.
        /// </summary>
        private readonly double _ut = Interlocked.Increment(ref _sequence) * 1_000_000.0;

        public Rp1HirePriceQueryTests()
        {
            Reset();
        }

        public void Dispose()
        {
            Reset();
        }

        private static void Reset()
        {
            CurrencyUtils.Reset();
            Database.SettingsSC.HireCost = 300;
            StrategySystem.Instance = new StrategySystem();
        }

        /// <summary>A leader in the save, appointed or not, named the way RP-1 names one.</summary>
        private static Strategy Leader(string name, bool active) =>
            new Strategy { Name = name, IsActive = active };

        [Fact]
        public void The_charge_is_RP1s_own_settings_value_and_no_modifier_touches_it()
        {
            // Von Braun: the one shipped leader that discounts hiring, 0.9 on both
            // role reasons. RP-1 shows 270 and takes 300, because KCTUtilities.
            // HireStaff multiplies the RAW HireCost and SpendFunds runs no query.
            // So this asserts the charge is UNMOVED by a modifier that is live and
            // is genuinely moving the quote beside it.
            CurrencyUtils.Multipliers[TransactionReasonsRP0.Hiring] = 0.9;
            var query = new Rp1HirePriceQuery();

            var prices = query.CaptureOnMain(_ut);

            Assert.Equal(300.0, prices!.Charge!.Value, 6);
            Assert.Equal(270.0, prices.EngineerQuote!.Value, 6);
            Assert.Equal(270.0, prices.ResearcherQuote!.Value, 6);
        }

        [Fact]
        public void Each_role_is_quoted_under_its_own_reason()
        {
            // Yvonne Brill's shape: researchers only. An implementation that asked
            // one query and published it twice passes every other test here and
            // fails this one.
            CurrencyUtils.Multipliers[TransactionReasonsRP0.HiringResearchers] = 1.05;
            var query = new Rp1HirePriceQuery();

            var prices = query.CaptureOnMain(_ut);

            Assert.Equal(300.0, prices!.EngineerQuote!.Value, 6);
            Assert.Equal(315.0, prices.ResearcherQuote!.Value, 6);
        }

        [Fact]
        public void A_leader_naming_only_the_composite_reason_still_moves_both_quotes()
        {
            // OKB-52 Chelomey, whose only transactionReason is `Hiring`. RP-1
            // matches bitwise, so it catches both roles. This is the case a
            // config-reading implementation keyed on the two role tokens misses
            // completely, and the reason this asks RP-1 instead.
            CurrencyUtils.Multipliers[TransactionReasonsRP0.Hiring] = 1.1;
            var query = new Rp1HirePriceQuery();

            var prices = query.CaptureOnMain(_ut);

            Assert.Equal(330.0, prices!.EngineerQuote!.Value, 6);
            Assert.Equal(330.0, prices.ResearcherQuote!.Value, 6);
        }

        [Fact]
        public void An_unchanged_career_is_asked_twice_and_not_again()
        {
            var query = new Rp1HirePriceQuery();

            query.CaptureOnMain(_ut);
            var afterFirst = CurrencyUtils.Queries;
            for (var i = 0; i < 20; i++)
            {
                query.CaptureOnMain(_ut);
            }

            Assert.Equal(2, afterFirst);
            Assert.Equal(afterFirst, CurrencyUtils.Queries);
        }

        [Fact]
        public void A_leader_taken_on_is_repriced_though_not_one_cost_input_moved()
        {
            // The gate's whole reason for existing, and the half that cannot be
            // copied from the upkeep query. HireCost does not move when a leader
            // is appointed and RP-1 stores the priced answer nowhere, so a gate on
            // the inputs alone would price once at load and never again. What
            // moved is WHO IS LISTENING.
            var leader = Leader("leaderVonBraunAdmin", active: false);
            StrategySystem.Instance!.Strategies.Add(leader);
            var query = new Rp1HirePriceQuery();
            var before = query.CaptureOnMain(_ut);
            Assert.Equal(300.0, before!.EngineerQuote!.Value, 6);

            leader.IsActive = true;
            CurrencyUtils.Multipliers[TransactionReasonsRP0.Hiring] = 0.9;
            var after = query.CaptureOnMain(_ut);

            Assert.Equal(270.0, after!.EngineerQuote!.Value, 6);
            Assert.Equal(300.0, after.Charge!.Value, 6);
        }

        [Fact]
        public void A_leader_dismissed_is_repriced_too()
        {
            var leader = Leader("leaderVonBraunAdmin", active: true);
            StrategySystem.Instance!.Strategies.Add(leader);
            CurrencyUtils.Multipliers[TransactionReasonsRP0.Hiring] = 0.9;
            var query = new Rp1HirePriceQuery();
            Assert.Equal(270.0, query.CaptureOnMain(_ut)!.EngineerQuote!.Value, 6);

            leader.IsActive = false;
            CurrencyUtils.Multipliers.Remove(TransactionReasonsRP0.Hiring);

            Assert.Equal(300.0, query.CaptureOnMain(_ut)!.EngineerQuote!.Value, 6);
        }

        [Fact]
        public void A_settings_value_that_moved_is_repriced()
        {
            var query = new Rp1HirePriceQuery();
            query.CaptureOnMain(_ut);

            Database.SettingsSC.HireCost = 450;
            var prices = query.CaptureOnMain(_ut);

            Assert.Equal(450.0, prices!.Charge!.Value, 6);
            Assert.Equal(450.0, prices.EngineerQuote!.Value, 6);
        }

        [Fact]
        public void An_hour_of_game_time_reprices_a_quote_no_gate_could_have_seen()
        {
            // The floor, and what it is for: any mod may subscribe to
            // OnCurrencyModifierQuery, and one that did would move the quote with
            // nothing in the strategy set to show it. Without the floor that
            // answer is wrong forever rather than for an hour, so the modifier
            // here is changed WITHOUT touching a leader or the settings.
            var query = new Rp1HirePriceQuery();
            Assert.Equal(300.0, query.CaptureOnMain(_ut)!.EngineerQuote!.Value, 6);

            CurrencyUtils.Multipliers[TransactionReasonsRP0.HiringEngineers] = 0.5;
            Assert.Equal(300.0, query.CaptureOnMain(_ut + 3599.0)!.EngineerQuote!.Value, 6);

            Assert.Equal(150.0, query.CaptureOnMain(_ut + 3600.0)!.EngineerQuote!.Value, 6);
        }

        [Fact]
        public void Time_running_backwards_reprices_rather_than_freezing()
        {
            // A revert or a reload moves UT backwards, and a floor written as a
            // forward difference stops firing for as long as the clock is behind
            // where it had reached.
            var query = new Rp1HirePriceQuery();
            query.CaptureOnMain(_ut + 100_000.0);

            CurrencyUtils.Multipliers[TransactionReasonsRP0.HiringEngineers] = 0.5;

            Assert.Equal(150.0, query.CaptureOnMain(_ut + 50_000.0)!.EngineerQuote!.Value, 6);
        }

        [Fact]
        public void An_unaskable_query_leaves_the_charge_standing_rather_than_substituting()
        {
            // The direction that matters. The charge needs no query at all, so a
            // currency model that cannot be asked costs the two quotes and nothing
            // else. Publishing the charge under a quote's name would be the exact
            // substitution Rp1EconomyUpkeepQuery exists to forbid.
            CurrencyUtils.ThrowOnQuery = true;
            var query = new Rp1HirePriceQuery();

            var prices = query.CaptureOnMain(_ut);

            Assert.Equal(300.0, prices!.Charge!.Value, 6);
            Assert.Null(prices.EngineerQuote);
            Assert.Null(prices.ResearcherQuote);
        }
    }
}
