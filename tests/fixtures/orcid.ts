/**
 * ORCID's documented example record (https://orcid.org/0000-0002-1825-0097,
 * a fictitious researcher ORCID publishes for testing integrations). The one
 * place the repository holds a real-shaped iD: tests and the end-to-end
 * suite import it from here; it is never anyone's data.
 */
export const EXAMPLE_ORCID_ID = '0000-0002-1825-0097'
export const EXAMPLE_ORCID_URI = `https://orcid.org/${EXAMPLE_ORCID_ID}`
/** The same iD with its last (check) character wrong: a typo the checksum catches. */
export const EXAMPLE_ORCID_TYPO = `${EXAMPLE_ORCID_ID.slice(0, -1)}${EXAMPLE_ORCID_ID.endsWith('8') ? '9' : '8'}`
