const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

// Mesmo fluxo de detecção e orçamento usado pelo FirawMerge, com modelos visuais.
const MODELS = [
  { name: 'gemma3:1b', downloadGb: 0.8, runtimeGb: 1.5, vision: false },
  { name: 'gemma3:4b', downloadGb: 3.3, runtimeGb: 5.0, vision: true },
  { name: 'gemma3:12b', downloadGb: 8.1, runtimeGb: 11.0, vision: true }
];

async function scanHardware() {
  const result = { cpu: os.cpus()[0]?.model?.trim() || 'CPU não identificada', threads: os.cpus().length,
    ramGb: Math.round(os.totalmem() / 1073741824), gpu: 'Não identificada', vramGb: 0, vramReliable: false };
  if (process.platform !== 'win32') return result;
  try {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command',
      'Get-CimInstance Win32_VideoController | Sort-Object AdapterRAM -Descending | Select-Object -First 1 -ExpandProperty Name'],
    { timeout: 8000, windowsHide: true });
    result.gpu = stdout.trim() || result.gpu;
    // Win32_VideoController.AdapterRAM é um valor de 32 bits e pode truncar a VRAM moderna.
    // Por isso não publicamos esse número como memória dedicada confiável.
  } catch { /* O editor segue utilizável se o diagnóstico falhar. */ }
  return result;
}

function recommend(hardware) {
  const usableRam = Math.max(2, Math.floor(hardware.ramGb * 0.7));
  const usableVram = hardware.vramReliable ? Math.max(0, hardware.vramGb - 2) : 0;
  const cpuBudget = hardware.threads >= 16 && usableRam >= 32 ? 11 : hardware.threads >= 8 ? 5 : 2;
  const candidates = MODELS.filter(model => model.runtimeGb + 1 <= usableRam &&
    (usableVram >= model.runtimeGb || model.runtimeGb <= cpuBudget));
  const model = candidates.at(-1) || MODELS[0];
  return { ...model, mode: usableVram >= model.runtimeGb ? 'GPU, se o Ollama oferecer suporte' : 'CPU',
    note: `Estimativa com ${usableRam} GB de RAM e ${usableVram} GB de VRAM disponíveis. O Ollama decide o uso real dos recursos.` };
}

module.exports = { MODELS, scanHardware, recommend };
