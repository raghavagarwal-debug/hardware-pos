export const getSetting = (key, defaultValue) => {
  const stored = localStorage.getItem(`settings_${key}`);
  if (stored === null) return defaultValue;
  try {
    return JSON.parse(stored);
  } catch {
    return stored;
  }
};

export const setSetting = (key, value) => {
  localStorage.setItem(`settings_${key}`, JSON.stringify(value));
};

export const applyTheme = (themeName) => {
  const theme = themeName || getSetting('theme', 'default');
  
  // Remove existing themes
  document.documentElement.className = '';
  
  // Add class if non-default theme is chosen
  if (theme !== 'default') {
    document.documentElement.classList.add(`theme-${theme}`);
  }
};
