export const generatePythonDriver = (userSource: string, functionName: string): string => {
  return `
import sys
import json

# --- USER CODE START ---
${userSource}
# --- USER CODE END ---

def main():
    raw_input = sys.stdin.read().strip()
    if not raw_input: return

    try:
        args = json.loads("[" + raw_input + "]")
    except Exception:
        args = [raw_input]

    target_func = None
    func_name = "${functionName}"

    if func_name in globals():
        target_func = globals()[func_name]
    elif 'Solution' in globals():
        try:
            sol_instance = globals()['Solution']()
            if hasattr(sol_instance, func_name):
                target_func = getattr(sol_instance, func_name)
        except Exception:
            pass

    if target_func is None:
        sys.stderr.write(f"Error: Function '{func_name}' not found.")
        sys.exit(1)

    try:
        result = target_func(*args)
        # Separators bỏ khoảng trắng thừa để khớp format
        print(json.dumps(result, separators=(',', ':')))
    except Exception as e:
        sys.stderr.write(f"Runtime Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
`;
};
