import { agent } from './agent.js';

async function main() {
  console.log('🤖 LangGraph Agent Example\n');

  // Example 1: Get weather
  console.log('Example 1: Getting weather for London');
  const result1 = await agent.invoke({
    messages: [{ role: 'user', content: 'What is the weather in London?' }],
  });
  console.log('Response:', result1.messages.at(-1)?.content);
  console.log('\n---\n');

  // Example 2: Get weather and sports
  console.log('Example 2: Getting weather and sports recommendations');
  const result2 = await agent.invoke({
    messages: [
      {
        role: 'user',
        content: 'What is the weather in Paris and what sports can I do?',
      },
    ],
  });
  console.log('Response:', result2.messages.at(-1)?.content);
  console.log('\n---\n');

  // Example 3: Multiple cities
  console.log('Example 3: Comparing weather in multiple cities');
  const result3 = await agent.invoke({
    messages: [
      {
        role: 'user',
        content: 'Compare the weather in San Francisco and Tokyo, and recommend sports for each.',
      },
    ],
  });
  console.log('Response:', result3.messages.at(-1)?.content);
}

main().catch(console.error);


