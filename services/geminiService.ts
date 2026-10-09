import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { ModelType } from "../types";

// Initialize the API client
// The API key is guaranteed to be in process.env.API_KEY per the environment setup.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const createChatSession = (model: string = ModelType.FLASH): Chat => {
  return ai.chats.create({
    model: model,
    config: {
      temperature: 0.7,
      systemInstruction: "You are an expert Senior React Engineer and Full Stack Developer. You are helpful, concise, and prioritize modern best practices (React 18+, TypeScript, Tailwind). When users provide code, analyze it for bugs, performance issues, and readability. If no code is provided, offer to help build something.",
    },
  });
};

export const sendMessageStream = async (
  chat: Chat, 
  message: string
): Promise<AsyncIterable<GenerateContentResponse>> => {
  try {
    const streamResult = await chat.sendMessageStream({ message });
    return streamResult;
  } catch (error) {
    console.error("Error sending message to Gemini:", error);
    throw error;
  }
};