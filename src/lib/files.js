// Shared browser file-reading helper.
export function readFileAs(file, mode) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    if (mode === 'image') reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}
