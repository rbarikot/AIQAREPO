import { test, expect } from '@playwright/test';
import { SigninGitLabPage } from '../pages/SigninGitLabPage';

test.describe('Signin GitLab Tests', () => {
  let signinPage: SigninGitLabPage;

  test.beforeEach(async ({ page }) => {
    signinPage = new SigninGitLabPage(page);
    await signinPage.navigate();
  });

  test('Successful login with valid credentials', async ({ page }) => {
    await signinPage.login('admin', 'admin');
    await expect(page).toHaveURL(/dashboard/);
  });

  test('Failed login with empty fields', async ({ page }) => {
    await signinPage.signInButton.click();
    const errorMessages = await signinPage.getErrorMessage();
    expect(errorMessages).toContain('This field is required.');
  });

  test('Failed login with invalid credentials', async ({ page }) => {
    await signinPage.login('invalidUser', 'invalidPass');
    const errorMessages = await signinPage.getErrorMessage();
    expect(errorMessages).toContain('Invalid username or password.');
  });

  test('Failed login with missing username', async ({ page }) => {
    await signinPage.passwordInput.fill('admin');
    await signinPage.signInButton.click();
    const errorMessages = await signinPage.getErrorMessage();
    expect(errorMessages).toContain('This field is required.');
  });

  test('Failed login with missing password', async ({ page }) => {
    await signinPage.usernameInput.fill('admin');
    await signinPage.signInButton.click();
    const errorMessages = await signinPage.getErrorMessage();
    expect(errorMessages).toContain('This field is required.');
  });
});