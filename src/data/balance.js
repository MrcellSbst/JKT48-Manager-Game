const trainingActivity = (label, skill, energy, cost, intensity, type) => ({ label, skill, energy, cost, intensity, type });

const TRAINING_ACTIVITIES = Object.fromEntries(['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina'].flatMap((skill) => {
  const label = skill === 'mc' ? 'MC' : `${skill[0].toUpperCase()}${skill.slice(1)}`;
  return [
    [`${skill}Light`, trainingActivity(`Light ${label} training`, skill, 8, 1_050_000, 0.6, 'light')],
    [skill, trainingActivity(`${label} training`, skill, 15, skill === 'vocal' || skill === 'dance' || skill === 'performance' ? 2_250_000 : 1_800_000, 1, 'medium')],
    [`${skill}Intensive`, trainingActivity(`Intensive ${label} training`, skill, 25, 4_200_000, 1.7, 'heavy')],
  ];
}));

export const BALANCE = {
  startingMoney: 850_000_000,
  weeklyRecovery: 40,
  dramaChance: 0.02,
  dramaDuration: 4,
  dramaCooldown: [8, 16],
  weeksPerYear: 48,
  weeksPerMonth: 4,
  auditionStartWeek: 37,
  foundingRosterSize: 16,
  theaterMinimumMembers: 12,
  // Year 1 of a run is treated as this calendar year when deriving fictional ages from birth years.
  birthdayReferenceYear: 2025,
  // Stamina cuts fatigue and boosts every form of recovery. costFloor stops a maxed stamina member
  // from reaching free activities.
  stamina: { costBase: 1.25, costPerPoint: 0.006, costFloor: 0.5, recoveryPerPoint: 0.004 },
  // A setlist played repeatedly inside the window loses demand until it is rested.
  theater: { boredomWindowWeeks: 8, boredomPerPlay: 0.07, boredomMax: 0.35 },
  // Injury is a scheduling problem, never a roster-size problem: an injured member still counts
  // toward the 12 required to keep the theater open, they just cannot be assigned.
  injury: {
    loadByType: { light: 1, medium: 2, heavy: 3 },
    loadThreshold: 6,
    chanceByEnergy: { high: 0.05, mid: 0.08, low: 0.12 },
    highEnergyThreshold: 70,
    lowEnergyThreshold: 30,
    severities: [
      { id: 'minor', label: 'Minor', weight: 60, weeks: 1, blocks: ['training', 'theater', 'offAir', 'meetGreet'] },
      { id: 'moderate', label: 'Moderate', weight: 30, weeks: 2, blocks: ['photoshoot', 'media', 'videoCall'] },
      { id: 'severe', label: 'Severe', weight: 10, weeks: 2, blocks: ['all'] },
    ],
  },
  // A member left out of every weekly activity drifts toward graduation.
  idle: { graduationWeightPerWeek: 1.4, noticeAfterWeeks: 3 },
  fire: { flatSeverance: 22_500_000, fanTrustPenalty: 6, reputationPenalty: 4 },
  salary: { regular: 12_000_000, trainee: 4_500_000, hardModeRegular: 9_000_000, hardModeTrainee: 3_375_000, annualIncreasePercent: 5, unpaidMonthsToEnd: 2 },
  loans: { offersPerYear: 3, termsMonths: [6, 9, 12], repaymentMultipliers: [1.5, 1.65, 1.8], monthlyFeeRate: 0.04, reputationPenalty: 2 },
  twoShot: { roulette: { slotsPerMember: 5, ticket: 100_000 }, meetGreet: { slotsPerEvent: 150, ticket: 180_000 } },
  seitansai: { fanGain: 1_500, oshiSentiment: 8, trustGain: 2, missedTrustLoss: 4, missedOshiLoss: 10 },
  managementDrama: { templates: [
    { title: 'Budget leak exposed', detail: 'An internal spending report damages confidence in management.', trust: -3, reputation: -4 },
    { title: 'Scheduling dispute spreads', detail: 'A planning disagreement becomes public and unsettles the roster.', trust: -4, reputation: -2 },
    { title: 'Office leadership questioned', detail: 'Fans demand clearer direction from the management office.', trust: -5, reputation: -3 },
  ] },
  trainee: {
    minimumWeeks: 12,
    minimumTrainingProgress: 24,
    minimumTheaterAppearances: 4,
    trainingProgressPerIntensity: 5,
  },
  mentorship: {
    durationWeeks: 8,
    developmentBonus: 0.2,
  },
  bonusSlots: 3,
  graduation: { year1Max: 0, normalMin: 4, normalMax: 6, extremeMax: 6, minGap: 2, maxGap: 4, minLead: 6, maxLead: 12, minimumTenureYears: 3, idleWeightPerWeek: 1.4 },
  managementTokenMultiplier: 0.5,
  theaterTiers: [
    { id: 'community', name: 'Community Theater', tier: 'Low', priceRange: [90_000_000, 150_000_000], capacityRange: [140, 240], ticketRange: [60_000, 80_000] },
    { id: 'city', name: 'City Theater', tier: 'Middle', priceRange: [210_000_000, 330_000_000], capacityRange: [300, 470], ticketRange: [80_000, 105_000] },
    { id: 'flagship', name: 'Flagship Theater', tier: 'High', priceRange: [390_000_000, 570_000_000], capacityRange: [580, 880], ticketRange: [100_000, 130_000] },
  ],
  activities: {
    ...TRAINING_ACTIVITIES,
    rest: { label: 'Rest', energy: 0, energyRecovery: 20, cost: 0, tone: 'rest', type: 'light' },
    theater: { label: 'Theater show', energy: 26, cost: 1_125_000, type: 'medium' },
    media: { label: 'Media appearance', energy: 10, cost: 750_000, revenuePerPopularity: 60_000, type: 'light' },
    // Off-air trades higher fatigue and a once-per-week limit for a premium over the theater gate.
    offAir: { label: 'Off-air performance', energy: 22, cost: 900_000, theaterRevenuePremium: [0.05, 0.10], requiredMembers: 12, maxPerWeek: 1, type: 'heavy' },
    liveStream: { label: 'Live Stream', energy: 0, energyRecovery: 6, cost: 300_000, revenuePerPopularity: 40_000, fansPerPopularity: 5, type: 'light' },
    photoshoot: { label: 'Photoshoot', energy: 10, cost: 1_800_000, type: 'light' },
    vc1: { label: 'Video Call', energy: 13, cost: 675_000, capacity: 150, ticket: 120_000, type: 'medium', schedulable: false },
    mg1: { label: 'Meet & Greet', energy: 30, cost: 1_125_000, capacity: 300, ticket: 50_000, type: 'heavy', schedulable: false },
    mvSupport: { label: 'MV · Supporting', energy: 18, cost: 4_500_000, type: 'heavy', schedulable: false },
    mvSenbatsu: { label: 'MV · Senbatsu', energy: 25, cost: 4_500_000, type: 'heavy', schedulable: false },
    mvCenter: { label: 'MV · Center', energy: 32, cost: 7_500_000, type: 'heavy', schedulable: false },
    mvProduction: { label: 'MV Production', energy: 25, cost: 0, type: 'heavy', schedulable: false },
    concertRehearsal: { label: 'Concert rehearsal', energy: 8, cost: 2_250_000, type: 'medium', schedulable: false },
    concert: { label: 'Concert', energy: 34, cost: 6_000_000, revenue: 0, type: 'heavy', schedulable: false },
    yearEndMeetGreet: { label: 'Year-end Meet & Greet', energy: 20, cost: 1_125_000, capacity: 300, ticket: 50_000, type: 'heavy', schedulable: false },
  },
};

const TRAINING_SKILLS = ['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina'];

export const SCHEDULE_ACTIVITY_GROUPS = [
  { label: 'Light training', activities: TRAINING_SKILLS.map((skill) => `${skill}Light`) },
  { label: 'Regular training', activities: TRAINING_SKILLS },
  { label: 'Intensive training', activities: TRAINING_SKILLS.map((skill) => `${skill}Intensive`) },
  { label: 'Media', activities: ['photoshoot', 'media'] },
  { label: 'Show', activities: ['theater', 'offAir'] },
];

export const SCHEDULE_STANDALONE_ACTIVITIES = ['rest', 'liveStream'];

export const FAN_BALANCE = {
  startingFans: 10_000,
  // The fan-target curve is anchored here, deliberately above the starting fanbase so Year 1
  // opens with a real climb (162,500) instead of a trivial target.
  startingFanTarget: 100_000,
  // Global tuning knob: every positive fan gain is reduced by 40% before soft-cap bands apply.
  generationMultiplier: 0.3,
  target: {
    fixedGrowthPercent: 0,
    startingRunningGrowthPercent: 120,
    runningGrowthIncreasePerYear: 0,
    maxRunningGrowthPercent: 120,
    year2PlusBonusPercent: 0,
  },
  softCap: [
    { minRatio: 0, maxRatio: 1, multiplier: 1 },
    { minRatio: 1, maxRatio: 1.1, multiplier: 0.75 },
    { minRatio: 1.1, maxRatio: 1.2, multiplier: 0.4 },
    { minRatio: 1.2, maxRatio: 1.3, multiplier: 0.15 },
    { minRatio: 1.3, maxRatio: Infinity, multiplier: 0.05 },
  ],
  activityResistance: {
    theater: 0,
    meetAndGreet: 0,
    videoCall: 0,
    media: 0.2,
    mv: 0.25,
    concert: 0.5,
    anniversaryConcert: 0.6,
    viralMv: 0.7,
    extremeViral: 0.95,
  },
  annualPerformance: [
    { id: 'exceptional', minRatio: 1.2, label: 'Exceptional', trustDelta: 6, reputationDelta: 5, reviewScore: 100, metaReward: 2 },
    { id: 'achieved', minRatio: 1, label: 'Target Achieved', trustDelta: 3, reputationDelta: 2, reviewScore: 85, metaReward: 1 },
    { id: 'slightlyBelow', minRatio: 0.9, label: 'Slightly Below Target', trustDelta: -1, reputationDelta: 0, reviewScore: 65, metaReward: 0 },
    { id: 'underperformed', minRatio: 0.75, label: 'Underperformed', trustDelta: -4, reputationDelta: -2, reviewScore: 40, metaReward: 0 },
    { id: 'majorFailure', minRatio: 0, label: 'Major Failure', trustDelta: -8, reputationDelta: -5, reviewScore: 15, metaReward: 0 },
  ],
};

export const CONCERT_BUDGETS = [
  { id: 'lean', name: 'Lean production', cost: 180_000_000, demandMultiplier: 0.85, quality: 58 },
  { id: 'standard', name: 'Standard production', cost: 300_000_000, demandMultiplier: 1, quality: 76 },
  { id: 'major', name: 'Major production', cost: 480_000_000, demandMultiplier: 1.25, quality: 92 },
];

export const SINGLE_BUDGETS = [
  { id: 'low', name: 'Low budget', cost: 75_000_000, quality: 58, popularityGain: 2, fanTrustGain: -1 },
  { id: 'medium', name: 'Medium budget', cost: 127_500_000, quality: 74, popularityGain: 3, fanTrustGain: 1 },
  { id: 'high', name: 'High budget', cost: 225_000_000, quality: 90, popularityGain: 5, fanTrustGain: 3 },
];

export const CONCERT_VENUES = [
  { id: 'hall', name: 'Concert hall', capacity: 2_000, cost: 0 },
  { id: 'arena', name: 'City arena', capacity: 4_500, cost: 120_000_000 },
  { id: 'stadium', name: 'National stadium', capacity: 7_500, cost: 270_000_000 },
];

export const OPPORTUNITIES = [
  { id: 'tv-special', title: 'TV Special', category: 'media', memberCount: 6, energy: 10, cost: 6_000_000, revenue: 12_000_000, fans: 3500, awareness: 3, reputation: 1 },
  { id: 'festival', title: 'Festival Invitation', category: 'live', memberCount: 12, energy: 20, cost: 22_500_000, revenue: 24_000_000, fans: 7000, awareness: 4, reputation: 2 },
  { id: 'brand', title: 'Brand Campaign', category: 'sponsor', memberCount: 4, energy: 8, cost: 4_500_000, revenue: 30_000_000, fans: 2600, awareness: 3, reputation: 1 },
  { id: 'radio', title: 'Radio Feature', category: 'media', memberCount: 3, energy: 6, cost: 2_250_000, revenue: 6_000_000, fans: 1400, awareness: 1, reputation: 1 },
  { id: 'variety', title: 'Variety Show Guest Slot', category: 'media', memberCount: 5, energy: 10, cost: 4_500_000, revenue: 9_000_000, fans: 3200, awareness: 3, reputation: 1 },
  { id: 'collaboration', title: 'Artist Collaboration', category: 'live', memberCount: 8, energy: 16, cost: 18_000_000, revenue: 16_000_000, fans: 5200, awareness: 4, reputation: 3 },
];

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
