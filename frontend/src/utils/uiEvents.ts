export const showSubtitle = (text: string) => {
  window.dispatchEvent(new CustomEvent('show_subtitle', { detail: { text } }));
};
