export const generateJavascriptDriver = (userSource: string, functionName: string): string => {
  return `
/* --- USER CODE START --- */
${userSource}
/* --- USER CODE END --- */

let rawInput = '';

// Prefer command-line base64 input to avoid occasional stdin pipe blocking.
const cliInputB64 = process.argv[2] || process.argv[1] || '';
if (cliInputB64) {
  try {
    rawInput = Buffer.from(cliInputB64, 'base64').toString('utf8').trim();
  } catch {
    rawInput = '';
  }
}

let args = [];
if (rawInput.length > 0) {
  try {
    args = JSON.parse('[' + rawInput + ']');
  } catch (err) {
    args = [rawInput];
  }
}

let funcToCall = null;
const targetName = "${functionName}";

// 1. Tìm hàm Global (VD: function twoSum() {})
// Sử dụng global[targetName] an toàn hơn
if (typeof global[targetName] === 'function') {
    funcToCall = global[targetName];
} 
// 2. Tìm biến Global (VD: const twoSum = ...)
// Ở đây chúng ta inject trực tiếp tên hàm vào string để JS runtime tự check
else if (typeof ${functionName} === 'function') {
    funcToCall = ${functionName};
}
// 3. Tìm trong Class Solution (Chuẩn LeetCode)
else if (typeof Solution === 'function') {
    const sol = new Solution();
    if (typeof sol[targetName] === 'function') {
        funcToCall = sol[targetName].bind(sol);
    }
}

if (!funcToCall) {
    console.error(\`Error: Function '\${targetName}' not found.\`);
    process.exit(1);
}

try {
    const result = funcToCall(...args);
    if (result !== undefined) {
        console.log(JSON.stringify(result));
    }
} catch (e) {
    console.error(e.toString());
    process.exit(1);
}
`;
};
