export function capitalize(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function generatePassword(length = 20): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  let password = ''
  for (let i = 0; i < length; i++) {
    const byte = array[i]
    if (byte !== undefined) {
      password += charset[byte % charset.length]
    }
  }
  return password
}
