import { Page, Locator } from '@playwright/test';

export class DAPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.getByLabel('Username');
    this.passwordInput = page.getByLabel('Password');
    this.loginButton = page.getByRole('button', { name: 'Login' });
    this.errorMessage = page.locator('text=Invalid username or password.');
  }

  async navigate() {
    await this.page.goto('http://10.119.33.78:8084/da/login');
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async isErrorMessageVisible() {
    return await this.errorMessage.isVisible();
  }

  async reloadPage() {
    await this.page.reload();
  }

  async getCurrentURL() {
    return this.page.url();
  }
}