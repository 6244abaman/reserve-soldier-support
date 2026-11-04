// An example profile used only by the tests: one soldier, two businesses.
// Invented for testing; not a real person.
module.exports = function sampleProfile() {
  return {
    meta: {
      profileId: "p-001",
      language: "he",
      createdAt: "2026-10-01T08:00:00Z",
      updatedAt: "2026-10-01T08:00:00Z",
      intakeComplete: true,
      unconfirmedFields: ["businesses[1].numbers.cashOnHand"]
    },
    person: {
      firstName: "Noam",
      phone: "050-123 4567",
      city: "Be'er Sheva",
      familySituation: "married, two children",
      checkInDay: "sun",
      preferredChannel: "whatsapp",
      consentToContact: true
    },
    service: {
      roleGeneral: "logistics",
      reserveDaysLastTwoYears: 210,
      status: "home",
      callUpStart: "2026-03-01",
      callUpEnd: "2026-07-15"
    },
    cover: {
      active: false,
      allowedTasks: ["monitor_only"],
      sharedBusinessIds: ["b-1"]
    },
    businesses: [
      {
        id: "b-1",
        name: "Noam Carpentry",
        sector: "trades_construction",
        yearsOperating: 6,
        employees: 1,
        numbers: {
          monthlyRevenueBefore: 32000,
          monthlyRevenueNow: 14000,
          fixedMonthlyCosts: 9000,
          cashOnHand: 18000,
          monthsOfCashLeft: 2,
          debts: [{ type: "supplier", amount: 7500, overdue: true, deadline: "2026-11-30" }]
        },
        customers: {
          regularCount: 12,
          lostDuringService: 5,
          sources: ["referrals", "local groups"],
          list: [{ name: "Cohen family", group: "open_quote", lastContact: "2026-09-20", note: "kitchen cabinets" }]
        },
        pricing: { method: "hours plus materials", marginPercent: 18 },
        capacity: { hoursPerWeek: 35, whoRunsItWhenAway: "nobody" },
        benefitsUsed: [],
        diagnosis: {
          completedAt: "2026-10-05T10:00:00Z",
          topProblems: [
            { problem: "Low cash", evidence: "2 months of cash left", confidence: "high", urgent: true },
            { problem: "Empty pipeline", evidence: "No jobs booked for December", confidence: "medium", urgent: false }
          ],
          unknowns: ["Real hours per job"]
        },
        plan: {
          summary: "Bring in cash first, then refill the pipeline.",
          priorities: [
            {
              goal: "Collect money owed",
              actions: [{ action: "Send reminder to Levi", dueDate: "2026-11-10", status: "not_started" }],
              successMeasure: "7,500 collected by 2026-11-30"
            }
          ],
          openQuestions: ["Confirm VAT timing with the accountant"]
        },
        marketing: {
          idealCustomer: "Families renovating kitchens nearby",
          idealCustomerConfirmed: false,
          channels: ["referrals", "Google Business profile"],
          weeklyTarget: "10 conversations, 2 quotes",
          drafts: ["Hi, I'm back from reserve duty and taking new jobs."],
          contentCalendar: [
            {
              plannedDate: "2026-11-12",
              channel: "Facebook",
              postType: "showing_work",
              text: "Finished this oak kitchen last week.",
              imageNote: "Photo of the finished kitchen",
              approval: "draft"
            }
          ],
          results: ""
        },
        followUpLog: [{ date: "2026-10-20", customer: "Cohen family", sentBy: "soldier", outcome: "replied", attempt: 1 }]
      },
      {
        id: "b-2",
        name: "Weekend furniture repair",
        sector: "other"
      }
    ],
    goals: { threeMonthOutcome: "Steady 25,000 a month from carpentry" },
    checkIns: [
      { date: "2026-10-26", answeredBy: "soldier", done: ["Called 3 customers"], blockers: [], nextActions: ["Send 2 quotes"], result: "1 quote accepted" }
    ],
    flags: { mentorEscalation: false, missedCheckIns: 0, nudgesPaused: false }
  };
};
