import type { Metadata } from 'next';
import { CONTACTS } from '@appshore/web-core/shared/lib/contacts';

export const metadata: Metadata = {
  title: 'AI Transparency',
};

export default function AiTransparencyPage() {
  return (
    <>
      <h1>AI Transparency</h1>
      <p>Last updated: {new Date().getFullYear()}</p>

      <h2>1. Where AI is used</h2>
      <p>
        The platform includes an AI assistant that can answer questions, summarize information, and perform actions you
        ask it to. AI-generated responses are clearly presented inside the assistant experience.
      </p>

      <h2>2. Human oversight</h2>
      <p>
        Sensitive actions initiated by the assistant require explicit human confirmation before they are executed. You
        remain in control of what the assistant is allowed to do via scoped permissions.
      </p>

      <h2>3. Your data and AI</h2>
      <ul>
        <li>Conversations may be processed by third-party AI model providers to generate responses.</li>
        <li>Your data is not used to train third-party foundation models without your consent.</li>
        <li>AI usage is metered per workspace and visible to workspace administrators.</li>
      </ul>

      <h2>4. Limitations</h2>
      <p>AI responses can be inaccurate or incomplete. Always verify important information before acting on it.</p>

      <h2>5. Contact</h2>
      <p>Questions about our use of AI? Email {CONTACTS.support}.</p>
    </>
  );
}
