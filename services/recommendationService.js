import axios from "axios";

const RECOMMENDATION_API = "http://localhost:8000/api/recommend"; 

export const getRecommendations = async (userId) => {
  try {
    const { data } = await axios.post(RECOMMENDATION_API, { user_id: userId });
    return data;
  } catch (error) {
    throw new Error(
      error.response?.data?.message || "Recommendation service failed"
    );
  }
};
