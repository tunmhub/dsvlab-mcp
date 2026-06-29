// 复用原项目 tools/circuit-validator-core.js(UMD,Node 可 require)做加载前校验。
import { createRequire } from 'module';
import { config } from '../config';

const localRequire = createRequire(__filename);
const validatorMod = localRequire(config.validatorCorePath) as {
  validateCircuit: (text: string) => ValidationResult;
};

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  components: unknown[];
  lines: unknown[];
}

export function validateCircuitText(text: string): ValidationResult {
  return validatorMod.validateCircuit(text);
}
