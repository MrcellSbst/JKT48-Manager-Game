const trainingActivity = (label, skill, energy, cost, intensity, type) => ({ label, skill, energy, cost, intensity, type });

const TRAINING_ACTIVITIES = Object.fromEntries(['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina'].flatMap((skill) => {
  const label = skill === 'mc' ? 'MC' : `${skill[0].toUpperCase()}${skill.slice(1)}`;
  return [
    [`${skill}Light`, trainingActivity(`Light ${label} training`, skill, 8, 700_000, 0.6, 'light')],
    [skill, trainingActivity(`${label} training`, skill, 15, skill === 'vocal' || skill === 'dance' || skill === 'performance' ? 1_500_000 : 1_200_000, 1, 'medium')],
    [`${skill}Intensive`, trainingActivity(`Intensive ${label} training`, skill, 25, 2_800_000, 1.7, 'heavy')],
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
  theaterMinimumMembers: 12,
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
  graduation: { year1Max: 3, normalMin: 2, normalMax: 5, extremeMax: 7, minGap: 2, maxGap: 4, minLead: 6, maxLead: 12, generatedMinimumTenureYears: 2 },
  theaterTiers: [
    { id: 'community', name: 'Community Theater', tier: 'Low', priceRange: [90_000_000, 150_000_000], capacityRange: [140, 240], ticketRange: [60_000, 80_000] },
    { id: 'city', name: 'City Theater', tier: 'Middle', priceRange: [210_000_000, 330_000_000], capacityRange: [300, 470], ticketRange: [80_000, 105_000] },
    { id: 'flagship', name: 'Flagship Theater', tier: 'High', priceRange: [390_000_000, 570_000_000], capacityRange: [580, 880], ticketRange: [100_000, 130_000] },
  ],
  activities: {
    ...TRAINING_ACTIVITIES,
    rest: { label: 'Rest', energy: 0, energyRecovery: 20, cost: 0, tone: 'rest', type: 'light' },
    theater: { label: 'Theater show', energy: 18, cost: 750_000, type: 'medium' },
    media: { label: 'Media appearance', energy: 10, cost: 500_000, revenuePerPopularity: 60_000, type: 'light' },
    offAir: { label: 'Off-air performance', energy: 14, cost: 600_000, revenuePerPopularity: 25_000, requiredMembers: 12, type: 'medium' },
    liveStream: { label: 'Live Stream', energy: 0, energyRecovery: 6, cost: 200_000, revenuePerPopularity: 40_000, fansPerPopularity: 5, type: 'light' },
    photoshoot: { label: 'Photoshoot', energy: 10, cost: 800_000, type: 'light' },
    vc1: { label: 'Video Call', energy: 13, cost: 450_000, capacity: 75, ticket: 120_000, type: 'medium', schedulable: false },
    mg1: { label: 'Meet & Greet', energy: 20, cost: 750_000, capacity: 300, ticket: 50_000, type: 'heavy', schedulable: false },
    mvSupport: { label: 'MV · Supporting', energy: 18, cost: 2_000_000, type: 'heavy', schedulable: false },
    mvSenbatsu: { label: 'MV · Senbatsu', energy: 25, cost: 3_000_000, type: 'heavy', schedulable: false },
    mvCenter: { label: 'MV · Center', energy: 32, cost: 5_000_000, type: 'heavy', schedulable: false },
    mvProduction: { label: 'MV Production', energy: 25, cost: 0, type: 'heavy', schedulable: false },
    concertRehearsal: { label: 'Concert rehearsal', energy: 8, cost: 1_000_000, type: 'medium', schedulable: false },
    concert: { label: 'Concert', energy: 34, cost: 4_000_000, revenue: 0, type: 'heavy', schedulable: false },
    yearEndMeetGreet: { label: 'Year-end Meet & Greet', energy: 20, cost: 750_000, capacity: 300, ticket: 50_000, type: 'heavy', schedulable: false },
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
  startingFans: 125_000,
  target: {
    fixedGrowthPercent: 10,
    startingRunningGrowthPercent: 20,
    runningGrowthIncreasePerYear: 5,
    maxRunningGrowthPercent: 35,
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
    { id: 'exceptional', minRatio: 1.2, label: 'Exceptional', trustDelta: 6, reputationDelta: 5, reviewScore: 100, metaReward: 5 },
    { id: 'achieved', minRatio: 1, label: 'Target Achieved', trustDelta: 3, reputationDelta: 2, reviewScore: 85, metaReward: 3 },
    { id: 'slightlyBelow', minRatio: 0.9, label: 'Slightly Below Target', trustDelta: -1, reputationDelta: 0, reviewScore: 65, metaReward: 1 },
    { id: 'underperformed', minRatio: 0.75, label: 'Underperformed', trustDelta: -4, reputationDelta: -2, reviewScore: 40, metaReward: 0 },
    { id: 'majorFailure', minRatio: 0, label: 'Major Failure', trustDelta: -8, reputationDelta: -5, reviewScore: 15, metaReward: 0 },
  ],
};

export const CONCERT_BUDGETS = [
  { id: 'lean', name: 'Lean production', cost: 120_000_000, demandMultiplier: 0.85, quality: 58 },
  { id: 'standard', name: 'Standard production', cost: 200_000_000, demandMultiplier: 1, quality: 76 },
  { id: 'major', name: 'Major production', cost: 320_000_000, demandMultiplier: 1.25, quality: 92 },
];

export const SINGLE_BUDGETS = [
  { id: 'low', name: 'Low budget', cost: 50_000_000, popularityGain: 2, fanTrustGain: -1 },
  { id: 'medium', name: 'Medium budget', cost: 85_000_000, popularityGain: 3, fanTrustGain: 1 },
  { id: 'high', name: 'High budget', cost: 150_000_000, popularityGain: 5, fanTrustGain: 3 },
];

export const CONCERT_VENUES = [
  { id: 'hall', name: 'Concert hall', capacity: 2_000, cost: 0 },
  { id: 'arena', name: 'City arena', capacity: 4_500, cost: 80_000_000 },
  { id: 'stadium', name: 'National stadium', capacity: 7_500, cost: 180_000_000 },
];

export const OPPORTUNITIES = [
  { id: 'tv-special', title: 'TV Special', category: 'media', memberCount: 6, energy: 10, cost: 4_000_000, revenue: 12_000_000, fans: 3500, awareness: 3, reputation: 1 },
  { id: 'festival', title: 'Festival Invitation', category: 'live', memberCount: 12, energy: 20, cost: 15_000_000, revenue: 24_000_000, fans: 7000, awareness: 4, reputation: 2 },
  { id: 'brand', title: 'Brand Campaign', category: 'sponsor', memberCount: 4, energy: 8, cost: 2_000_000, revenue: 30_000_000, fans: 2600, awareness: 3, reputation: 1 },
  { id: 'radio', title: 'Radio Feature', category: 'media', memberCount: 3, energy: 6, cost: 1_000_000, revenue: 6_000_000, fans: 1400, awareness: 1, reputation: 1 },
  { id: 'variety', title: 'Variety Show Guest Slot', category: 'media', memberCount: 5, energy: 10, cost: 3_000_000, revenue: 9_000_000, fans: 3200, awareness: 3, reputation: 1 },
  { id: 'collaboration', title: 'Artist Collaboration', category: 'live', memberCount: 8, energy: 16, cost: 12_000_000, revenue: 16_000_000, fans: 5200, awareness: 4, reputation: 3 },
];

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
