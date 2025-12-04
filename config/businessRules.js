module.exports = {
  packages: {
    silver: {
      pv: 35,
      pairIncome: 10,
      capping: 4
    },
    gold: {
      pv: 155,
      pairIncome: 50,
      capping: 1
    },
    ruby: {
      pv: 1250,
      pairIncome: 500,
      capping: 1
    }
  },

  royalty: {
    minPV: 35, 
    levels: {
      1: 1.0,
      2: 1.1,
      3: 1.2,
      4: 1.5,
      5: 2.0,
      6: 3.0,
      7: 5.0,
      8: 8.0,
    }
  },

  levelIncome: {
    percent: 0.5, // BV
    maxLevels: 10
  },

  binary: {
    requiredPairsForRank: 8
  },

  nominee: {
    ruby: {
      percent: 1,
      monthlyCap: 10000
    }
  }
};
