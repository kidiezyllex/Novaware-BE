const sizeRecommendation = (function () {
  const sizeChart = {
    male: {
      S: { height: [155, 160], weight: [40, 50], priority: 0.5 },
      M: { height: [161, 167], weight: [51, 60], priority: 0.5 },
      L: { height: [168, 175], weight: [61, 70], priority: 0.5 },
      XL: { height: [176, 185], weight: [71, 80], priority: 0.5 },
    },
    female: {
      S: { height: [146, 153], weight: [36, 44], priority: 0.5 },
      M: { height: [154, 160], weight: [45, 52], priority: 0.5 },
      L: { height: [161, 168], weight: [53, 61], priority: 0.5 },
      XL: { height: [169, 176], weight: [62, 71], priority: 0.5 },
    },
  };

  const calculateDistance = (h1, w1, h2, w2, priority) => {
    const heightDistance = Math.abs(h1 - (h2[0] + h2[1]) / 2) * priority;
    const weightDistance = Math.abs(w1 - (w2[0] + w2[1]) / 2) * (1 - priority);
    return Math.sqrt(
      heightDistance * heightDistance + weightDistance * weightDistance
    );
  };

  const recommendSize = (gender, height, weight, priority = 0.5) => {
    if (!gender || !height || !weight || height < 0 || weight < 0) {
      return "Invalid input parameters.";
    }

    const chart = sizeChart[gender];
    if (!chart) {
      return "Invalid gender or chart not found.";
    }

    let bestSize = null;
    let minDistance = Infinity;

    for (const size in chart) {
      const {
        height: heightRange,
        weight: weightRange,
        priority: sizePriority,
      } = chart[size];
      const distance = calculateDistance(
        height,
        weight,
        heightRange,
        weightRange,
        sizePriority
      );

      if (distance < minDistance) {
        minDistance = distance;
        bestSize = size;
      }
    }

    if (bestSize) {
      return bestSize;
    } else {
      return "Could not determine the appropriate size.";
    }
  };

  return {
    recommendSize,
  };
})();

export default sizeRecommendation.recommendSize;
