const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('http://localhost:3000');
  
  // Wait for the app to load
  await page.waitForSelector('h2'); // Or any element
  
  // Find the 'Capture' tab/button and click it if it's not active
  // Based on the UI, it's likely a tab
  const captureTab = (await page.$x("//button[contains(., 'Add Fāʾidah')]"))[0] || (await page.$x("//button[contains(., 'Capture')]"))[0];
  if (captureTab) {
    await captureTab.click();
    await page.waitForTimeout(1000);
  }
  
  console.log("Clicking 'Upload Book Image'");
  // Click the 'Upload Book Image' area
  const uploadArea = (await page.$x("//h3[contains(., 'Upload Book Image')]"))[0];
  if (uploadArea) {
    await uploadArea.click();
  } else {
    console.log("Upload area not found!");
  }
  
  await page.waitForTimeout(2000);
  
  await browser.close();
})();
