import { tool, type Tool } from 'langchain';
import * as z from 'zod';

// Weather data map
const weatherMap: Record<string, string> = {
  london: 'sunny',
  paris: 'rainy',
  'san francisco': 'foggy',
  tokyo: 'cloudy',
  'new york': 'sunny',
  berlin: 'rainy',
  sydney: 'sunny',
  moscow: 'snowy',
};

// Sports for weather map
const sportsForWeatherMap: Record<string, string[]> = {
  sunny: ['tennis', 'golf', 'swimming', 'beach volleyball'],
  rainy: ['indoor basketball', 'rock climbing', 'yoga', 'table tennis'],
  foggy: ['hiking', 'running', 'cycling'],
  cloudy: ['soccer', 'baseball', 'frisbee'],
  snowy: ['skiing', 'snowboarding', 'ice skating', 'hockey'],
};

export const getWeather = tool(
  async ({ city }: { city: string }) => {
    const normalizedCity = city.toLowerCase().trim();
    const weather = weatherMap[normalizedCity] || 'unknown';
    return {
      weather: weather,
      city: city,
    };
  },
  {
    name: 'get_weather',
    description: 'Get the current weather for a given city. Returns weather conditions like sunny, rainy, foggy, cloudy, or snowy.',
    schema: z.object({
      city: z.string().describe('The name of the city to get weather for'),
    }),
  }
);
  
export const getSportsForWeather = tool(
  async ({ weather }: { weather: string }): Promise<{ sports: string }> => {
    const normalizedWeather = weather.toLowerCase().trim();
    const sports = sportsForWeatherMap[normalizedWeather] || ['unknown'];
    return {
      sports: sports.join(', '),
    };
  },
  {
    name: 'get_sports_for_weather',
    description: 'Get recommended sports activities based on weather conditions (sunny, rainy, foggy, cloudy, snowy).',
    schema: z.object({
      weather: z.string().describe('The weather condition (e.g., sunny, rainy, foggy, cloudy, snowy)'),
    }),
  } as const
);

