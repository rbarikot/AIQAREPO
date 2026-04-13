import { test, expect } from '@playwright/test';
import { FormattedPage } from '../pages/FormattedPage';

test.describe('Formatted Login Tests', () => {
  let formattedPage: FormattedPage;

  test.beforeEach(async ({ page }) => {
    formattedPage = new FormattedPage(page);
    await formattedPage.navigate();
  });

  test('Successful login with valid credentials', async ({ page }) => {
    await formattedPage.login('admin@gmail.com', 'ValidPassword123!');
    await expect(formattedPage.successMessage).toBeVisible();
    await expect(page).toHaveURL(/dashboard/);
  });

  test('Successful login with minimal valid email input', async ({ page }) => {
    await formattedPage.login('a@b.co', 'ValidPassword123!');
    await expect(formattedPage.successMessage).toBeVisible();
    await expect(page).toHaveURL(/dashboard/);
  });

  test('Login fails with invalid email format', async ({ page }) => {
    await formattedPage.login('invalidemail@', 'ValidPass123!');
    await expect(formattedPage.errorMessage).toBeVisible();
    await expect(formattedPage.getErrorMessage()).resolves.toContain('Please enter a valid email address');
  });

  test('Login fails with missing email field', async ({ page }) => {
    await formattedPage.login('', 'ValidPass123!');
    await expect(formattedPage.errorMessage).toBeVisible();
    await expect(formattedPage.getErrorMessage()).resolves.toContain('Email field is required');
  });

  test('Login fails with too short password', async ({ page }) => {
    await formattedPage.login('user@example.com', '123');
    await expect(formattedPage.errorMessage).toBeVisible();
    await expect(formattedPage.getErrorMessage()).resolves.toContain('Password must be at least 6 characters long');
  });
});