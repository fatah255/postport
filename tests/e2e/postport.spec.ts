import { expect, test } from "@playwright/test";
import { createConnection, createDraft, createJob, createMedia, installMockApi } from "./helpers/mock-api";

test("registers, connects a target, uploads media, and schedules a draft", async ({ page }) => {
  const mock = await installMockApi(page);

  await page.goto("/en/register");
  await page.getByLabel("Full name").fill("Launch Owner");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("postport123!");
  await page.getByLabel("Confirm").fill("postport123!");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/en\/dashboard$/);

  await page.goto("/en/connections");
  await page.getByRole("button", { name: /connect instagram/i }).click();
  await expect(page.getByText("Instagram Demo")).toBeVisible();

  await page.goto("/en/media");
  await page.locator("[data-testid='media-upload-input']").setInputFiles({
    name: "launch.png",
    mimeType: "image/png",
    buffer: Buffer.from("mock-image")
  });
  await expect(page.getByText("launch.png")).toBeVisible();

  await page.goto("/en/drafts/new");
  await page.getByLabel("Title").fill("Scheduled launch");
  await page.getByRole("button", { name: "INSTAGRAM" }).click();
  await page.getByText("launch.png").click();
  await page.getByLabel("Schedule time").fill("2026-03-29T10:30");
  await page.getByTestId("draft-schedule-button").click();

  await expect(page).toHaveURL(/\/en\/calendar$/);
  await expect(page.getByText("Scheduled launch")).toBeVisible();
  expect(mock.state.connections).toHaveLength(1);
});

test("rejects unsupported media uploads in the browser", async ({ page }) => {
  const mock = await installMockApi(page);
  mock.state.signedIn = true;

  await page.goto("/en/media");
  await page.locator("[data-testid='media-upload-input']").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not supported")
  });

  await expect(page.getByText("Only images and videos are supported.")).toBeVisible();
});

test("publishes now and lands on successful history", async ({ page }) => {
  const mock = await installMockApi(page);
  mock.state.signedIn = true;
  mock.state.connections.push(createConnection("INSTAGRAM"));
  mock.state.media.push(createMedia({ originalFilename: "hero.png" }));

  await page.goto("/en/drafts/new");
  await page.getByLabel("Title").fill("Instant launch");
  await page.getByRole("button", { name: "INSTAGRAM" }).click();
  await page.getByText("hero.png").click();
  await page.getByTestId("draft-publish-now-button").click();

  await expect(page).toHaveURL(/\/en\/history$/);
  await expect(page.getByRole("heading", { name: "INSTAGRAM | SUCCEEDED" })).toBeVisible();
  await expect(page.getByText("Remote publish id:")).toBeVisible();
});

test("shows connection reauth state when token health is bad", async ({ page }) => {
  const mock = await installMockApi(page);
  mock.state.signedIn = true;
  const connection = createConnection("TIKTOK", {
    displayName: "TikTok Needs Reauth",
    health: {
      tokenValid: false,
      accountStatus: "EXPIRED",
      warnings: ["Token validity: Reconnect the account to refresh the token."],
      checks: [
        {
          key: "token",
          label: "Token validity",
          status: "fail",
          message: "Reconnect the account to refresh the token."
        }
      ]
    }
  });
  mock.state.connections.push(connection);

  await page.goto(`/en/connections/${connection.id}`);

  await expect(page.getByText("Reconnect the account to refresh the token.", { exact: true })).toBeVisible();
  await expect(page.getByText("EXPIRED")).toBeVisible();
});

test("retries a failed transient publish into success", async ({ page }) => {
  const mock = await installMockApi(page);
  mock.state.signedIn = true;
  const draft = createDraft({ title: "Retry me", platforms: ["FACEBOOK"] });
  mock.state.drafts.push(draft);
  mock.state.publishJobs.push(createJob({ draftId: draft.id, platform: "FACEBOOK", status: "FAILED" }));

  await page.goto("/en/history");
  await expect(page.getByRole("heading", { name: "FACEBOOK | FAILED" })).toBeVisible();
  await page.getByRole("button", { name: "Retry job" }).click();
  await expect(page.getByRole("heading", { name: "FACEBOOK | SUCCEEDED" })).toBeVisible();
});

test("handles bulk media upload and saves a draft using both assets", async ({ page }) => {
  const mock = await installMockApi(page);
  mock.state.signedIn = true;
  mock.state.connections.push(createConnection("INSTAGRAM"));

  await page.goto("/en/media");
  await page.locator("[data-testid='media-upload-input']").setInputFiles([
    {
      name: "one.png",
      mimeType: "image/png",
      buffer: Buffer.from("one")
    },
    {
      name: "two.png",
      mimeType: "image/png",
      buffer: Buffer.from("two")
    }
  ]);
  await expect(page.getByText("one.png")).toBeVisible();
  await expect(page.getByText("two.png")).toBeVisible();

  await page.goto("/en/drafts/new");
  await page.getByLabel("Title").fill("Bulk draft");
  await page.getByRole("button", { name: "INSTAGRAM" }).click();
  await page.getByText("one.png").click();
  await page.getByText("two.png").click();
  await page.getByTestId("draft-save-button").click();

  await expect(page).toHaveURL(/\/en\/drafts$/);
  await expect(page.getByText("Bulk draft")).toBeVisible();
  await expect(page.getByText(/Media: 2/)).toBeVisible();
});
