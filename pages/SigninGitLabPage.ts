import { Page, Locator } from '@playwright/test';

export class SigninGitLabPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.getByTestId('username-field');
    this.passwordInput = page.getByTestId('password-field');
    this.signInButton = page.getByTestId('sign-in-button');
  }

  async navigate() {
    await this.page.goto('https://gitlab.otxlab.net/users/sign_in');
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  async getErrorMessage() {
    return await this.page.locator('text=This field is required.').allInnerTexts();
  }
}