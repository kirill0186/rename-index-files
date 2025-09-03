// import { log } from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import { Project } from 'ts-morph';

// Parse command line arguments
const args = process.argv.slice(2);
let targetFolderPath = 'src'; // Folder containing index files to rename
let projectFolderPath = '.';  // Root project folder for TypeScript context
let tsConfigPath = 'tsconfig.json';

// Helper function to normalize paths (convert backslashes to forward slashes)
function normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
}

// If positional arguments are provided, use them
if (args.length >= 1) {
    targetFolderPath = args[0];
}
if (args.length >= 2) {
    tsConfigPath = args[1];
}
if (args.length >= 3) {
    projectFolderPath = args[2];
} else {
    // If project folder not specified, use the directory containing the tsconfig
    projectFolderPath = path.dirname(tsConfigPath);
}

console.log(`Target folder for renaming: ${targetFolderPath}`);
console.log(`Project folder for TypeScript context: ${projectFolderPath}`);
console.log(`Using tsconfig: ${tsConfigPath}`);

// Validate inputs
if (!fs.existsSync(tsConfigPath)) {
    console.error(`Error: tsconfig file not found at path: ${tsConfigPath}`);
    process.exit(1);
}

if (!fs.existsSync(targetFolderPath)) {
    console.error(`Error: target folder not found at path: ${targetFolderPath}`);
    process.exit(1);
}

// Initialize project
try {
    // Create project with explicit configuration for finding all files
    const project = new Project({
        // Use the provided tsconfig for compiler options
        tsConfigFilePath: tsConfigPath,
        // But explicitly include files from the specified folder
        skipAddingFilesFromTsConfig: true,
    });
    
    // Add all TypeScript/JavaScript files from the project folder for context
    project.addSourceFilesAtPaths([
        `${projectFolderPath}/**/*.{ts,tsx,js,jsx}`,
        `${projectFolderPath}/**/*.test.{ts,tsx,js,jsx}`,
        `${projectFolderPath}/**/*.tests.{ts,tsx,js,jsx}`
    ]);

    // 1. Find all index.* files with any pattern in the target folder
    const allSourceFiles = project.getSourceFiles();
    // console.log(`Found ${allSourceFiles.length} total source files in the project.`);
    
    // Normalize the target folder path for comparison
    const normalizedTargetPath = normalizePath(targetFolderPath);
    
    const indexFiles = allSourceFiles.filter(sourceFile => {
        const filePath = normalizePath(sourceFile.getFilePath());
        const fileName = path.basename(filePath);

        // Check if the file is within the target folder and is an index file
        return filePath.includes(normalizedTargetPath) && fileName.startsWith('index.');
    });
    console.log(`Found ${indexFiles.length} index files to rename in the target folder.`);

    indexFiles.forEach((file) => {
        const filePath = file.getFilePath();
        // log(`========Renaming file: ${filePath}=========`);
        const dir = path.dirname(filePath);
        const parentName = path.basename(dir);
        
        // Extract the file extension with any middle parts (like .test., .spec., etc.)
        const fileName = path.basename(filePath);
        let extension;
        
        // Check if it's a pattern-based file (like index.test.ts)
        const patternMatch = fileName.match(/^index(\..+\.)([^.]+)$/);
        if (patternMatch) {
            // For pattern files like index.test.ts, keep the pattern
            extension = patternMatch[1] + patternMatch[2];
        } else {
            // For simple files like index.ts, extract just the extension
            const simpleMatch = fileName.match(/^index(\.[^.]+)$/);
            extension = simpleMatch ? simpleMatch[1] : '.tsx';
        }
        
        const newFilePath = path.join(dir, `${parentName}${extension}`);

        // 2. Rename file
        fs.renameSync(filePath, newFilePath);

        // 3. Update imports across project
        // Only update imports for standard index files (index.ts, index.tsx, etc.), not for pattern files like index.test.ts
        const isStandardIndexFile = /^index\.(ts|tsx|js|jsx)$/.test(fileName);
        
        if (isStandardIndexFile) {
            const referencingSourceFiles = file.getReferencingSourceFiles();
            referencingSourceFiles.forEach((sf) => {
                // log(`--------------Updating imports in: ${sf.getFilePath()}--------------`);

                sf.getImportDeclarations().forEach((imp) => {
                    const sourceFile = imp.getModuleSpecifierSourceFile();
                    const sourceFilePath = sourceFile ? sourceFile.getFilePath() : 'null';

                    if(sourceFilePath === filePath) {
                    const spec = imp.getModuleSpecifierValue();
                    // log(`  Checking import: ${spec}`);

                    // Handle imports for standard index files only
                    if (spec.endsWith(`/index`)) {
                        // For explicit index imports: './components/Button/index' -> './components/Button/Button'
                        const basePath = spec.substring(0, spec.length - 6); // Remove "/index" suffix
                        imp.setModuleSpecifier(`${basePath}/${parentName}`);
                    } else {
                        // For implicit index imports: './components/Button' -> './components/Button/Button'
                        imp.setModuleSpecifier(`${spec}/${parentName}`);
                    }
                    }
                });
            });
        }
    });

    // 4. Save changes
    project.saveSync();
    console.log('All files renamed and imports updated successfully!');

} catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
}