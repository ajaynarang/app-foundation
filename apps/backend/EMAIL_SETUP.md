# Email Service Setup

The SALLY backend includes an email service for sending user invitations and other notifications.

## Email Providers

The service supports multiple providers in priority order:

1. **Resend** (Recommended) - Modern email API with great deliverability
2. **Nodemailer with SMTP** - Traditional SMTP for any email provider
3. **Console Mode** (Development) - Logs emails to console instead of sending

## Setup Options

### Option 1: Resend (Recommended for Production)

1. Sign up at [resend.com](https://resend.com)
2. Get your API key from the dashboard
3. Add to `.env`:

```bash
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=noreply@yourdomain.com
APP_URL=https://yourdomain.com
```

**Benefits:**
- ✅ Simple setup
- ✅ Great deliverability
- ✅ Free tier: 100 emails/day
- ✅ No SMTP configuration needed

### Option 2: SMTP with Nodemailer

Use any SMTP provider (Gmail, SendGrid, Mailgun, etc.)

#### Gmail Example:

1. Enable 2-factor authentication
2. Generate an [App Password](https://myaccount.google.com/apppasswords)
3. Add to `.env`:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com
APP_URL=http://localhost:3000
```

#### SendGrid Example:

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
EMAIL_FROM=noreply@yourdomain.com
APP_URL=http://localhost:3000
```

### Option 3: Console Mode (Development)

If no email credentials are configured, emails are logged to the console:

```bash
# No email config needed - just make sure APP_URL is set
APP_URL=http://localhost:3000
```

You'll see emails in the backend logs like this:

```
========================================
EMAIL (Console Mode)
========================================
From: noreply@appshore.in
To: user@example.com
Subject: You're invited to join Acme Corp on SALLY
----------------------------------------
HTML Content:
[Full email HTML here]
========================================
```

## Testing

Send a test invitation:

1. Log in as an ADMIN user
2. Go to User Management
3. Click "Invite User"
4. Fill in the details and send

**With Resend/SMTP:** Email will be sent to the recipient
**Console Mode:** Check the backend logs to see the email content

## Email Templates

### User Invitation Email

Includes:
- Professional branded header
- Company name and inviter information
- Accept invitation button with link
- 7-day expiration notice
- Mobile-responsive HTML design

## Troubleshooting

### Emails not sending (Resend)
- ✅ Check API key is correct
- ✅ Verify domain is verified in Resend dashboard
- ✅ Check Resend logs for errors

### Emails not sending (SMTP)
- ✅ Check SMTP credentials
- ✅ Enable "Less secure app access" (Gmail)
- ✅ Use App Password instead of regular password (Gmail)
- ✅ Check firewall isn't blocking port 587/465

### Emails going to spam
- ✅ Verify your sending domain (SPF, DKIM records)
- ✅ Use a professional from address
- ✅ Warm up your sending domain gradually

## Production Checklist

- [ ] Set up Resend or configure SMTP with verified domain
- [ ] Set `EMAIL_FROM` to your company email
- [ ] Set `APP_URL` to your production URL
- [ ] Test invitation flow end-to-end
- [ ] Check spam folders and email deliverability
- [ ] Set up SPF, DKIM, and DMARC records for your domain

## Future Enhancements

Potential improvements for the email service:

- [ ] Email templates with React Email
- [ ] Retry logic for failed sends
- [ ] Email queue with Bull/Redis
- [ ] Email analytics and tracking
- [ ] Transactional email logging
- [ ] Multiple email templates (password reset, welcome, etc.)
