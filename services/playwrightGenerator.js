export function generatePlaywrightSpec(testCases) {
  let script = `
import { test, expect } from '@playwright/test';

`;

  testCases.forEach((tc) => {
    script += `
test('${tc.title}', async ({ page }) => {

  // Preconditions: ${tc.preconditions}

  await page.goto('http://localhost:3000');

`;

    tc.steps.forEach((step) => {
      script += `  // ${step}\n`;
    });

    script += `
  // Expected Result: ${tc.expectedResult}

});
`;
  });

  return script;
}
