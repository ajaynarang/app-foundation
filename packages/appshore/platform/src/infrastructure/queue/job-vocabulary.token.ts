/**
 * DI token for the merged job vocabulary (`JobVocabulary` from `@appshore/kernel`): the kernel's queues, job names,
 * display names, categories and manual types plus the app's. The app binds it once, in its queue module, to
 * `buildJobVocabulary(<its job-names.ts>)`, so a key defined twice fails at boot. Unbound, readers fall back to the
 * kernel vocabulary alone.
 */
export const JOB_VOCABULARY = 'APPSHORE_JOB_VOCABULARY';
