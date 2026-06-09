import * as fs from 'fs';
import { loadKnowledgeEntries, loadProductManualEntries, loadAllEntries } from '../content/content-loader';

jest.mock('fs');

const mockedFs = jest.mocked(fs);

const SAMPLE_MD = `---
title: "What is the platform?"
documentType: faq
audience: prospect
category: general
keywords:
  - platform
  - overview
---

The platform is an assistant.
`;

const SAMPLE_NO_KEYWORDS = `---
title: "Pricing"
documentType: pricing
audience: prospect
category: pricing
---

Three pricing tiers.
`;

// Helper to create mock Dirent objects
function mockDirent(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir, isFile: () => !isDir } as any;
}

describe('loadKnowledgeEntries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The implementation calls fs.existsSync before reading
    mockedFs.existsSync.mockReturnValue(true);
  });

  it('should parse frontmatter and content correctly', () => {
    mockedFs.readdirSync.mockImplementation((dirPath: any) => {
      const dir = String(dirPath);
      if (dir.endsWith('knowledge-base')) {
        return [mockDirent('faq', true)] as any;
      }
      if (dir.endsWith('faq')) {
        return [mockDirent('what-is-app.md', false)] as any;
      }
      return [];
    });
    mockedFs.readFileSync.mockReturnValue(SAMPLE_MD);

    const entries = loadKnowledgeEntries();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      title: 'What is the platform?',
      content: 'The platform is an assistant.',
      documentType: 'faq',
      audience: 'prospect',
      category: 'general',
      keywords: ['platform', 'overview'],
    });
  });

  it('should load files from multiple subdirectories', () => {
    mockedFs.readdirSync.mockImplementation((dirPath: any) => {
      const dir = String(dirPath);
      if (dir.endsWith('knowledge-base')) {
        return [mockDirent('faq', true), mockDirent('pricing', true)] as any;
      }
      if (dir.endsWith('faq')) {
        return [mockDirent('what-is-app.md', false)] as any;
      }
      if (dir.endsWith('pricing')) {
        return [mockDirent('pricing-tiers.md', false)] as any;
      }
      return [];
    });
    mockedFs.readFileSync.mockImplementation((filePath) => {
      if (String(filePath).includes('pricing')) return SAMPLE_NO_KEYWORDS;
      return SAMPLE_MD;
    });

    const entries = loadKnowledgeEntries();
    expect(entries).toHaveLength(2);
  });

  it('should filter non-.md files', () => {
    mockedFs.readdirSync.mockImplementation((dirPath: any) => {
      const dir = String(dirPath);
      if (dir.endsWith('knowledge-base')) {
        return [mockDirent('faq', true), mockDirent('.DS_Store', false)] as any;
      }
      if (dir.endsWith('faq')) {
        return [mockDirent('what-is-app.md', false), mockDirent('README.txt', false)] as any;
      }
      return [];
    });
    mockedFs.readFileSync.mockReturnValue(SAMPLE_MD);

    const entries = loadKnowledgeEntries();
    expect(entries).toHaveLength(1);
  });

  it('should handle missing keywords gracefully', () => {
    mockedFs.readdirSync.mockImplementation((dirPath: any) => {
      const dir = String(dirPath);
      if (dir.endsWith('knowledge-base')) {
        return [mockDirent('pricing', true)] as any;
      }
      if (dir.endsWith('pricing')) {
        return [mockDirent('pricing-tiers.md', false)] as any;
      }
      return [];
    });
    mockedFs.readFileSync.mockReturnValue(SAMPLE_NO_KEYWORDS);

    const entries = loadKnowledgeEntries();
    expect(entries[0].keywords).toEqual([]);
  });

  it('should handle mix of root files and subdirectories', () => {
    mockedFs.readdirSync.mockImplementation((dirPath: any) => {
      const dir = String(dirPath);
      if (dir.endsWith('knowledge-base')) {
        return [mockDirent('faq', true), mockDirent('standalone.md', false)] as any;
      }
      if (dir.endsWith('faq')) {
        return [mockDirent('alerts.md', false)] as any;
      }
      return [];
    });
    mockedFs.readFileSync.mockReturnValue(SAMPLE_MD);

    const entries = loadKnowledgeEntries();
    expect(entries).toHaveLength(2);
  });

  it('should return empty array when directory does not exist', () => {
    mockedFs.existsSync.mockReturnValue(false);

    const entries = loadKnowledgeEntries();
    expect(entries).toEqual([]);
  });

  it('should throw on missing required frontmatter', () => {
    const invalidMd = `---
title: "Test"
---

Content without documentType, audience, category.
`;
    mockedFs.readdirSync.mockImplementation((dirPath: any) => {
      const dir = String(dirPath);
      if (dir.endsWith('knowledge-base')) {
        return [mockDirent('bad.md', false)] as any;
      }
      return [];
    });
    mockedFs.readFileSync.mockReturnValue(invalidMd);

    expect(() => loadKnowledgeEntries()).toThrow('Missing required frontmatter');
  });

  it('should throw on invalid documentType', () => {
    const invalidMd = `---
title: "Test"
documentType: invalid_type
audience: prospect
category: general
---

Content.
`;
    mockedFs.readdirSync.mockImplementation((dirPath: any) => {
      const dir = String(dirPath);
      if (dir.endsWith('knowledge-base')) {
        return [mockDirent('bad.md', false)] as any;
      }
      return [];
    });
    mockedFs.readFileSync.mockReturnValue(invalidMd);

    expect(() => loadKnowledgeEntries()).toThrow('Invalid documentType');
  });

  it('should throw on invalid audience', () => {
    const invalidMd = `---
title: "Test"
documentType: faq
audience: invalid_audience
category: general
---

Content.
`;
    mockedFs.readdirSync.mockImplementation((dirPath: any) => {
      const dir = String(dirPath);
      if (dir.endsWith('knowledge-base')) {
        return [mockDirent('bad.md', false)] as any;
      }
      return [];
    });
    mockedFs.readFileSync.mockReturnValue(invalidMd);

    expect(() => loadKnowledgeEntries()).toThrow('Invalid audience');
  });
});

describe('loadProductManualEntries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFs.existsSync.mockReturnValue(true);
  });

  it('should load entries from product-manual directory', () => {
    mockedFs.readdirSync.mockImplementation((dirPath: any) => {
      const dir = String(dirPath);
      if (dir.endsWith('product-manual')) {
        return [mockDirent('guide.md', false)] as any;
      }
      return [];
    });
    mockedFs.readFileSync.mockReturnValue(SAMPLE_MD);

    const entries = loadProductManualEntries();
    expect(entries).toHaveLength(1);
  });

  it('should return empty when product-manual dir does not exist', () => {
    mockedFs.existsSync.mockReturnValue(false);
    const entries = loadProductManualEntries();
    expect(entries).toEqual([]);
  });
});

describe('loadAllEntries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFs.existsSync.mockReturnValue(true);
  });

  it('should combine entries from both directories', () => {
    mockedFs.readdirSync.mockImplementation((dirPath: any) => {
      const dir = String(dirPath);
      if (dir.endsWith('knowledge-base')) {
        return [mockDirent('faq.md', false)] as any;
      }
      if (dir.endsWith('product-manual')) {
        return [mockDirent('guide.md', false)] as any;
      }
      return [];
    });
    mockedFs.readFileSync.mockReturnValue(SAMPLE_MD);

    const entries = loadAllEntries();
    expect(entries).toHaveLength(2);
  });
});
