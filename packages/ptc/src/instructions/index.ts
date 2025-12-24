import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface InstructionTemplate {
  title: string;
  description: string;
  toolCatalogPlaceholder: string;
  examples: {
    basic: { description: string; code: string };
    loops: { description: string; code: string };
    multiple: { description: string; code: string };
  };
  criticalRules: {
    title: string;
    items: string[];
  };
  importantNotes: {
    title: string;
    items: string[];
  };
  footer: string;
}

/**
 * Load and parse the instruction template from YAML
 * In development, reads from src/instructions/template.yaml
 * In production (published package), reads from dist/instructions/template.yaml
 */
function loadTemplate(): InstructionTemplate {
  // Try dist first (production), then fall back to src (development)
  const distPath = join(__dirname, 'template.yaml');
  const srcPath = join(__dirname, '..', 'src', 'instructions', 'template.yaml');
  
  let templatePath: string;
  try {
    // Check if dist file exists
    readFileSync(distPath, 'utf-8');
    templatePath = distPath;
  } catch {
    // Fall back to src for development
    templatePath = srcPath;
  }
  
  const templateContent = readFileSync(templatePath, 'utf-8');
  return parse(templateContent) as InstructionTemplate;
}

/**
 * Render the instruction template with variable substitution
 */
export function renderInstructions(toolCatalog: string): string {
  const template = loadTemplate();
  
  // Build the instruction string
  let instructions = `\n## ${template.title}\n\n${template.description}\n\n${toolCatalog}\n\n`;
  
  // Add examples
  instructions += `${template.examples.basic.description}\n`;
  instructions += `\`\`\`typescript\n${template.examples.basic.code}\n\`\`\`\n\n`;
  
  instructions += `${template.examples.loops.description}\n`;
  instructions += `\`\`\`typescript\n${template.examples.loops.code}\n\`\`\`\n\n`;
  
  instructions += `${template.examples.multiple.description}\n`;
  instructions += `\`\`\`typescript\n${template.examples.multiple.code}\n\`\`\`\n\n`;
  
  // Add critical rules
  instructions += `${template.criticalRules.title}:\n`;
  template.criticalRules.items.forEach((rule, index) => {
    instructions += `${index + 1}. ${rule}\n`;
  });
  instructions += '\n';
  
  // Add important notes
  instructions += `${template.importantNotes.title}: \n`;
  template.importantNotes.items.forEach(note => {
    instructions += `- ${note}\n`;
  });
  instructions += '\n';
  
  // Add footer
  instructions += `${template.footer}\n`;
  
  return instructions;
}

