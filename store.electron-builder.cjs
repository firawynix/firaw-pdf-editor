const base = require('./package.json').build;
const { signtoolOptions, publisherName, ...baseWin } = base.win;

module.exports = {
  ...base,
  directories: { ...base.directories, output: 'release/store', buildResources: 'store/assets' },
  win: {
    ...baseWin,
    target: [{ target: 'appx', arch: ['x64', 'ia32'] }],
    signExecutable: false,
  },
  appx: {
    applicationId: 'FirawPdfEditor',
    identityName: 'Firawynix.Firaw-PdfEditor',
    publisher: 'CN=1FDE3668-C222-4506-AFE6-E2E425EAECD8',
    publisherDisplayName: 'Firawynix',
    displayName: 'Firaw - Pdf Editor',
    languages: ['pt-BR'],
    minVersion: '10.0.17763.0',
    maxVersionTested: '10.0.26100.0',
    capabilities: ['runFullTrust', 'internetClient', 'privateNetworkClientServer'],
  },
};
