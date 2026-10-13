const RELEASE_URL = 'https://github.com/jorgegn29/Synbio-studio/releases/latest';
const INSTALLER = 'SynBio-Studio-1.0.0-Windows-x64-Setup.exe';

export function ReleaseTitleLink() {
  return (
    <a
      className="release-link"
      href={RELEASE_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={`${INSTALLER} (Inno Setup): atlas 3D, LSP, motor Python e integraciones de laboratorio.`}
    >
      Versión completa
    </a>
  );
}

export function ReleaseBanner() {
  return (
    <aside className="release-banner">
      <p>
        <strong>Demo en el navegador.</strong> La versión profesional completa es el instalador de Windows <code>{INSTALLER}</code> (Inno Setup): atlas 3D, LSP, motor Python e integraciones de laboratorio.
      </p>
      <a href={RELEASE_URL} target="_blank" rel="noopener noreferrer">Descargar</a>
    </aside>
  );
}
