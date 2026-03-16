export const generateJavaDriver = (
  userSource: string,
  functionName: string,
  inputTypes: string[],
): string => {
  let parsingLogic = '';
  let argsList = '';

  inputTypes.forEach((type, index) => {
    const varName = `arg${index}`;
    argsList += (index > 0 ? ', ' : '') + varName;
    const rawPart = `parts.get(${index})`;

    switch (type) {
      case 'int':
        parsingLogic += `            int ${varName} = Parser.parseInt(${rawPart});\n`;
        break;
      case 'long':
        parsingLogic += `            long ${varName} = Parser.parseLong(${rawPart});\n`;
        break;
      case 'float':
        parsingLogic += `            float ${varName} = Parser.parseFloat(${rawPart});\n`;
        break;
      case 'double':
        parsingLogic += `            double ${varName} = Parser.parseDouble(${rawPart});\n`;
        break;
      case 'boolean':
        parsingLogic += `            boolean ${varName} = Parser.parseBoolean(${rawPart});\n`;
        break;
      case 'char':
        parsingLogic += `            char ${varName} = Parser.parseChar(${rawPart});\n`;
        break;
      case 'String':
        parsingLogic += `            String ${varName} = Parser.parseString(${rawPart});\n`;
        break;
      case 'int[]':
        parsingLogic += `            int[] ${varName} = Parser.parseIntArray(${rawPart});\n`;
        break;
      case 'String[]':
        parsingLogic += `            String[] ${varName} = Parser.parseStringArray(${rawPart});\n`;
        break;
      case 'ListNode':
        parsingLogic += `            ListNode ${varName} = Parser.parseListNode(${rawPart});\n`;
        break;
      default:
        parsingLogic += `            Object ${varName} = null;\n`;
    }
  });

  // Xóa 'public' ở class Solution để tránh lỗi 2 public class trong 1 file
  const sanitizedUserSource = userSource.replace(/public\s+class\s+Solution/, 'class Solution');

  return `
import java.util.*;
import java.util.stream.*;
import java.io.*;

// --- 1. DRIVER (MAIN CLASS) ---
public class Main {
    public static void main(String[] args) {
        String input = Parser.readAllInput();
        if (input.isEmpty()) return;

        try {
            // Tách tham số bằng logic đếm ngoặc (An toàn tuyệt đối)
            List<String> parts = Parser.splitArgs(input);
            
            // Nếu số lượng tham số không khớp (do lỗi parse hoặc input rỗng), dừng lại
            if (parts.size() < ${inputTypes.length}) {
                // System.err.println("Input parsing failed. Expected ${inputTypes.length} args, found " + parts.size());
                return;
            }

            ${parsingLogic}
            
            Solution sol = new Solution();
            Object result = sol.${functionName}(${argsList});
            
            Parser.print(result);
        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }
    }
}

// --- 2. USER CODE ---
${sanitizedUserSource}

// --- 3. HELPER CLASSES ---
class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class Parser {
    // Đọc stdin nhanh bằng BufferedReader
    public static String readAllInput() {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in))) {
            StringBuilder result = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                result.append(line);
            }
            return result.toString().trim();
        } catch (IOException e) {
            return "";
        }
    }

    // --- LOGIC TÁCH ARGUMENT CHUẨN (Thay thế Regex) ---
    public static List<String> splitArgs(String input) {
        List<String> args = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int bracketBalance = 0; // Đếm [ và ]
        boolean inQuote = false; // Đếm "

        for (char c : input.toCharArray()) {
            if (c == '"' && (current.length() == 0 || current.charAt(current.length() - 1) != '\\\\')) {
                inQuote = !inQuote;
            }
            
            if (!inQuote) {
                if (c == '[') bracketBalance++;
                else if (c == ']') bracketBalance--;
            }

            // Chỉ cắt khi: Gặp dấu phẩy AND Không nằm trong ngoặc AND Không nằm trong quote
            if (c == ',' && bracketBalance == 0 && !inQuote) {
                args.add(current.toString().trim());
                current.setLength(0); // Reset buffer
            } else {
                current.append(c);
            }
        }
        // Add phần tử cuối cùng
        if (current.length() > 0) {
            args.add(current.toString().trim());
        }
        return args;
    }

    // --- Primitives ---
    public static int parseInt(String s) { return Integer.parseInt(s.trim()); }
    public static long parseLong(String s) { return Long.parseLong(s.trim()); }
    public static float parseFloat(String s) { return Float.parseFloat(s.trim()); }
    public static double parseDouble(String s) { return Double.parseDouble(s.trim()); }
    public static boolean parseBoolean(String s) { return Boolean.parseBoolean(s.trim()); }
    public static char parseChar(String s) { 
        s = s.trim();
        // Handle 'c' or "c"
        if (s.length() >= 3 && (s.startsWith("'") || s.startsWith("\\""))) return s.charAt(1);
        return s.charAt(0);
    }
    public static String parseString(String s) {
        s = s.trim();
        if (s.length() >= 2 && s.startsWith("\\"") && s.endsWith("\\"")) return s.substring(1, s.length() - 1);
        return s;
    }

    // --- Arrays ---
    public static int[] parseIntArray(String s) {
        s = s.trim();
        if (s.equals("[]") || s.equals("")) return new int[0];
        s = s.replace("[", "").replace("]", "");
        if (s.trim().isEmpty()) return new int[0];
        return Arrays.stream(s.split(",")).map(String::trim).mapToInt(Integer::parseInt).toArray();
    }
    
    public static String[] parseStringArray(String s) {
        s = s.trim(); 
        if (s.equals("[]") || s.equals("")) return new String[0];
        s = s.substring(1, s.length() - 1);
        // Dùng lại splitArgs cho mảng chuỗi để an toàn với dấu phẩy
        List<String> list = splitArgs(s); 
        return list.stream().map(Parser::parseString).toArray(String[]::new);
    }

    // --- ListNode ---
    public static ListNode parseListNode(String s) {
        int[] nums = parseIntArray(s);
        if (nums.length == 0) return null;
        ListNode dummy = new ListNode(0);
        ListNode curr = dummy;
        for (int num : nums) { curr.next = new ListNode(num); curr = curr.next; }
        return dummy.next;
    }

    // --- Printer ---
    public static void print(Object result) {
        if (result == null) System.out.println("null");
        else if (result instanceof int[]) System.out.println(Arrays.toString((int[]) result).replace(" ", ""));
        else if (result instanceof String[]) {
            String s = Arrays.stream((String[]) result).map(val -> "\\"" + val + "\\"").collect(Collectors.joining(","));
            System.out.println("[" + s + "]");
        }
        else if (result instanceof Object[]) {
            String s = Arrays.stream((Object[]) result).map(String::valueOf).collect(Collectors.joining(","));
            System.out.println("[" + s + "]");
        }
        else if (result instanceof ListNode) {
            List<Integer> list = new ArrayList<>();
            ListNode curr = (ListNode) result;
            while (curr != null) { list.add(curr.val); curr = curr.next; }
            System.out.println(list.toString().replace(" ", ""));
        } 
        else if (result instanceof Boolean) System.out.println(result.toString());
        else System.out.println(result);
    }
}
`;
};
