import axios from 'axios';

const API_TOKEN = "YOUR_HUGGINGFACE_TOKEN_HERE"; 
const API_URL = "https://api-inference.huggingface.co/models/EleutherAI/gpt-neox-20b"; 

export const chatWithGPT2 = async (message) => {
  try {
    const payload = {
      inputs: message,
      parameters: {}
    };

    const response = await axios.post(API_URL, payload, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 200000, 
    });

    if (response.status === 200) {
      const responseData = response.data;
      let generatedText = "";

      if (Array.isArray(responseData) && responseData.length > 0 && responseData[0].generated_text) {
        generatedText = responseData[0].generated_text;
      } else if (responseData.generated_text) {
        generatedText = responseData.generated_text;
      } else {
        throw new Error("Không thể sinh văn bản từ mô hình. Xin thử lại sau.");
      }
      return generatedText
    } else {
      throw new Error(`Lỗi từ API: ${response.status} - ${response.statusText}`);
    }

  } catch (error) {
    console.error('Lỗi khi gọi GPT-2 API:', error.response ? error.response.data : error.message);
    throw new Error('Lỗi khi giao tiếp với GPT-2 API');
  }
};