import { test, expect } from '@playwright/test';
import { DAPage } from '../pages/DAPage';

test.describe('DA Feature Tests', () => {
  let daPage: DAPage;

  test.beforeEach(async ({ page }) => {
    daPage = new DAPage(page);
    await daPage.navigate();
  });

  test('Successful Login with Valid Credentials', async ({ page }) => {
    await daPage.login('admin', 'admin');
    await expect(page).toHaveURL(/dashboard/);
  });

  test('Failed Login with Invalid Username', async ({ page }) => {
    await daPage.login('invalidUser', 'admin');
    await expect(daPage.isErrorMessageVisible()).resolves.toBe(true);
  });

  test('Failed Login with Invalid Password', async ({ page }) => {
    await daPage.login('admin', 'invalidPassword');
    await expect(daPage.isErrorMessageVisible()).resolves.toBe(true);
  });

  test('Failed Login with Empty Fields', async ({ page }) => {
    await daPage.login('', '');
    await expect(daPage.isErrorMessageVisible()).resolves.toBe(true);
  });

  test('Session Management After Successful Login', async ({ page }) => {
    await daPage.login('admin', 'admin');
    await daPage.reloadPage();
    await expect(daPage.getCurrentURL()).toBe('http://10.119.33.78:8084/da/app#/management/applications');
  });
});