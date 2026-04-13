import { Page, Locator } from '@playwright/test';

export class FormattedPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('user[email]');
    this.passwordInput = page.getByLabel('user[password]');
    this.loginButton = page.getByRole('button', { name: 'Login' });
    this.successMessage = page.getByText('Login successful! Welcome back!');
    this.errorMessage = page.getByText('Invalid email or password');
  }

  async navigate() {
    await this.page.goto('https://cirro.io/users/sign_in');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async isSuccessMessageVisible() {
    return await this.successMessage.isVisible();
  }

  async getErrorMessage() {
    return await this.errorMessage.textContent();
  }
}