require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    // Verify connection/config
    await transporter.verify();
    console.log('SMTP connection verified');

    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: process.env.NOTIFY_TO || process.env.SMTP_USER,
      subject: 'CredBazar SMTP test',
      text: 'This is a test message from CredBazar server.'
    });

    console.log('Test email sent:', info.response || info);
  } catch (err) {
    console.error('SMTP test failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
