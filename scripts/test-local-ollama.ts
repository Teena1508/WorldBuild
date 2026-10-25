/**
 * Manual test script for verifying live local Ollama model narrative analysis.
 * Run with: npx tsx scripts/test-local-ollama.ts
 */

import { checkOllamaStatus, queryLocalOllama, getOllamaConfig } from '../src/lib/ai/ollama';

async function main() {
  console.log('===============================================================');
  console.log(' WORLDBUILD Story Studio — Live Local Ollama Verification Tool');
  console.log('===============================================================');

  const config = getOllamaConfig();
  console.log(`Configured Base URL: ${config.baseUrl}`);
  console.log(`Configured Model:    ${config.model}`);
  console.log(`Timeout:             ${config.timeoutMs}ms\n`);

  console.log('Step 1: Checking local Ollama daemon connection...');
  const status = await checkOllamaStatus();

  if (!status.isAvailable) {
    console.error('\n❌ LOCAL OLLAMA DAEMON IS NOT DETECTED:');
    console.error(`   ${status.errorMessage}`);
    console.log('\nTo run a live local model:');
    console.log('   1. Install Ollama: https://ollama.com');
    console.log('   2. Start Ollama:   ollama serve');
    console.log(`   3. Pull model:     ollama pull ${config.model}`);
    console.log('   4. Re-run this script: npx tsx scripts/test-local-ollama.ts\n');
    process.exit(0);
  }

  console.log('✅ Ollama daemon is reachable on loopback address.');
  console.log(`   Installed models in local library: [${status.installedModels.join(', ')}]`);

  if (!status.modelAvailable) {
    console.error(`\n❌ CONFIGURED MODEL "${config.model}" IS NOT INSTALLED.`);
    console.log(`   Run: ollama pull ${config.model}`);
    process.exit(0);
  }

  console.log(`✅ Model "${config.model}" is available in local library.\n`);

  console.log('Step 2: Sending sample fantasy scene to local model...');
  const sampleCanonContext = `=== CANON REPOSITORY CONTEXT ===
[CHARACTERS]
- Silas the Exiled Scribe: Status=alive. Banished to the Lower Crypts. Has never entered the Glass Observatory.
- Lady Lyra: Status=alive. Guardian of the Celestial Star-Chart. Keeps the Silver Astrolabe locked in the Obsidian Vault.

[SECRETS]
- The Astral Rift: The secret ritual required to tear open the firmament. Known ONLY to Lady Lyra.`;

  const sampleManuscript = `Silas walked nonchalantly into the Glass Observatory. He produced the Silver Astrolabe from his velvet coat, laughing as he began reciting the exact verses of the Astral Rift ritual that Lyra had sworn never to reveal.`;

  const systemPrompt = `You are the WORLDBUILD Continuity Oracle fiction editor.
Analyze the chapter manuscript against the canon context. Identify character knowledge contradictions or unexplained object transfers.
Respond ONLY with JSON matching:
{"findings": [{"category": "character_knowledge"|"object_continuity", "severity": "high"|"critical", "title": "...", "description": "...", "passage": "...", "conflicting_canon": "...", "explanation": "...", "suggested_fix": "...", "confidence": 0.9}]}`;

  const userPrompt = `${sampleCanonContext}\n\n=== MANUSCRIPT ===\n${sampleManuscript}\n\nIdentify contradictions.`;

  const startTime = Date.now();
  try {
    const { findings, rawOutput } = await queryLocalOllama(userPrompt, systemPrompt);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ Local inference completed in ${duration}s!`);
    console.log(`   Raw Output from ${config.model}:\n   ${rawOutput}\n`);
    console.log(`   Validated Findings (${findings.length}):`);
    findings.forEach((f, idx) => {
      console.log(`   [${idx + 1}] [${f.severity.toUpperCase()}] ${f.title}`);
      console.log(`       Category:    ${f.category}`);
      console.log(`       Confidence:  ${Math.round(f.confidence * 100)}%`);
      console.log(`       Passage:     "${f.passage || 'N/A'}"`);
      console.log(`       Explanation: ${f.explanation}`);
      console.log(`       Suggested:   ${f.suggested_fix}\n`);
    });

    console.log('===============================================================');
    console.log(' Live Ollama integration verified successfully!');
    console.log('===============================================================');
  } catch (err) {
    console.error('\n❌ Live inference failed:');
    console.error(err instanceof Error ? err.message : String(err));
  }
}

main();
