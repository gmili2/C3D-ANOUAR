import sys
import re

def remove_comments(content):
    # States
    NORMAL = 0
    SINGLE_QUOTE = 1
    DOUBLE_QUOTE = 2
    BACKTICK = 3
    COMMENT = 4
    
    state = NORMAL
    result = []
    i = 0
    length = len(content)
    
    while i < length:
        char = content[i]
        
        if state == NORMAL:
            if char == "'":
                state = SINGLE_QUOTE
                result.append(char)
            elif char == '"':
                state = DOUBLE_QUOTE
                result.append(char)
            elif char == '`':
                state = BACKTICK
                result.append(char)
            elif char == '/' and i + 1 < length and content[i+1] == '/':
                state = COMMENT
                i += 1 # Skip the second slash
            else:
                result.append(char)
        
        elif state == SINGLE_QUOTE:
            if char == "'" and content[i-1] != '\\':
                state = NORMAL
            result.append(char)
            
        elif state == DOUBLE_QUOTE:
            if char == '"' and content[i-1] != '\\':
                state = NORMAL
            result.append(char)
            
        elif state == BACKTICK:
            if char == '`' and content[i-1] != '\\':
                state = NORMAL
            result.append(char)
            
        elif state == COMMENT:
            if char == '\n':
                state = NORMAL
                result.append(char)
            # Ignore characters inside comment
            
        i += 1
        
    return "".join(result)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python strip_comments.py <file_path>")
        sys.exit(1)
        
    file_path = sys.argv[1]
    
    try:
        with open(file_path, 'r') as f:
            content = f.read()
            
        new_content = remove_comments(content)
        
        # Remove empty lines that might have been created (optional, but good for cleanup)
        # But be careful not to remove intentional empty lines.
        # The user just asked to remove comments.
        # If a line was just a comment, it becomes an empty line.
        # I will leave it as is for now, or maybe remove lines that are now just whitespace?
        # Let's just remove the comments first.
        
        with open(file_path, 'w') as f:
            f.write(new_content)
            
        print(f"Successfully removed comments from {file_path}")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
