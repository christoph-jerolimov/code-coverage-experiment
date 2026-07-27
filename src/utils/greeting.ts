export function greet(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'Hello, stranger!';
  }
  return `Hello, ${capitalize(trimmed)}!`;
}

export function capitalize(word: string): string {
  if (word.length === 0) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1);
}
