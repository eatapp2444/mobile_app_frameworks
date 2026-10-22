import {
  compareVersions,
  decideUpdate,
  fallbackStoreUrl,
  isVersionString,
  resolvePlatformPolicy,
} from '../updatePolicy';

describe('compareVersions', () => {
  it('orders dotted versions', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
    expect(compareVersions('2.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
  });

  it('treats missing segments as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1', '1.0.0')).toBe(0);
  });
});

describe('isVersionString', () => {
  it('rejects empty or non-numeric values so absent fields never gate', () => {
    expect(isVersionString(undefined)).toBe(false);
    expect(isVersionString('')).toBe(false);
    expect(isVersionString('  ')).toBe(false);
    expect(isVersionString('latest')).toBe(false);
    expect(isVersionString('3.6.0')).toBe(true);
    expect(isVersionString('7')).toBe(true);
  });
});

describe('resolvePlatformPolicy', () => {
  it('reads the nested ios / android objects', () => {
    const policy = resolvePlatformPolicy(
      {
        ios: {
          minVersion: '3.2.0',
          latestVersion: '3.4.1',
          storeUrl: 'https://apps.apple.com/app/id1',
          message: 'Please update',
        },
        android: { minVersion: '9.9.9' },
      },
      'ios',
    );
    expect(policy.minVersion).toBe('3.2.0');
    expect(policy.latestVersion).toBe('3.4.1');
    expect(policy.storeUrl).toBe('https://apps.apple.com/app/id1');
    expect(policy.message).toBe('Please update');
  });

  it('ignores the other platform and treats missing nested fields as absent', () => {
    const android = resolvePlatformPolicy(
      { ios: { minVersion: '9.0.0' }, android: { latestVersion: '1.2.0' } },
      'android',
    );
    expect(android.minVersion).toBeUndefined();
    expect(android.latestVersion).toBe('1.2.0');
  });

  it('falls back to legacy forceUpdate + minimumVersion', () => {
    const policy = resolvePlatformPolicy(
      { forceUpdate: true, minimumVersion: '2.0.0', androidStoreUrl: 'https://play.example/app' },
      'android',
    );
    expect(policy.minVersion).toBe('2.0.0');
    expect(policy.storeUrl).toBe('https://play.example/app');
  });

  it('does not treat legacy minimumVersion as forced without forceUpdate', () => {
    const policy = resolvePlatformPolicy({ minimumVersion: '9.0.0' }, 'ios');
    expect(policy.minVersion).toBeUndefined();
  });

  it('lets nested minVersion force without a forceUpdate flag', () => {
    const policy = resolvePlatformPolicy({ ios: { minVersion: '4.0.0' } }, 'ios');
    expect(policy.minVersion).toBe('4.0.0');
  });

  it('returns an empty policy when version is missing (backwards compatible)', () => {
    expect(resolvePlatformPolicy(undefined, 'ios')).toEqual({
      minVersion: undefined,
      latestVersion: undefined,
      storeUrl: undefined,
      message: undefined,
      maintenanceMode: false,
      maintenanceMessage: undefined,
      iosAppId: undefined,
    });
  });
});

describe('decideUpdate', () => {
  const base = {
    appName: 'EatApp',
    platform: 'ios' as const,
    bundleId: 'app.eatapp.demo',
  };

  it('does not gate when config fields are absent', () => {
    expect(
      decideUpdate({
        ...base,
        installed: '1.0.0',
        policy: resolvePlatformPolicy({}, 'ios'),
      }),
    ).toEqual({ kind: 'none' });
  });

  it('blocks when installed is below minVersion', () => {
    const decision = decideUpdate({
      ...base,
      installed: '3.0.0',
      policy: resolvePlatformPolicy({ ios: { minVersion: '3.5.0', storeUrl: 'https://apps.apple.com/app/id1' } }, 'ios'),
    });
    expect(decision).toMatchObject({
      kind: 'forced',
      minVersion: '3.5.0',
      storeUrl: 'https://apps.apple.com/app/id1',
    });
  });

  it('soft-nags when installed is below latestVersion but not minVersion', () => {
    const decision = decideUpdate({
      ...base,
      installed: '3.5.0',
      policy: resolvePlatformPolicy(
        { ios: { minVersion: '3.0.0', latestVersion: '3.6.0', storeUrl: 'https://apps.apple.com/app/id1' } },
        'ios',
      ),
    });
    expect(decision.kind).toBe('soft');
    if (decision.kind === 'soft') expect(decision.latestVersion).toBe('3.6.0');
  });

  it('prefers forced over soft when below both', () => {
    const decision = decideUpdate({
      ...base,
      installed: '1.0.0',
      policy: resolvePlatformPolicy({ ios: { minVersion: '2.0.0', latestVersion: '3.0.0' } }, 'ios'),
    });
    expect(decision.kind).toBe('forced');
  });

  it('does not gate when installed meets latestVersion', () => {
    expect(
      decideUpdate({
        ...base,
        installed: '3.6.0',
        policy: resolvePlatformPolicy({ ios: { minVersion: '3.0.0', latestVersion: '3.6.0' } }, 'ios'),
      }).kind,
    ).toBe('none');
  });

  it('uses a derived store URL when storeUrl is omitted', () => {
    const decision = decideUpdate({
      ...base,
      platform: 'android',
      bundleId: 'com.example.app',
      installed: '1.0.0',
      policy: resolvePlatformPolicy({ android: { minVersion: '2.0.0' } }, 'android'),
    });
    expect(decision.kind).toBe('forced');
    if (decision.kind === 'forced') {
      expect(decision.storeUrl).toBe('https://play.google.com/store/apps/details?id=com.example.app');
    }
  });
});

describe('fallbackStoreUrl', () => {
  it('builds Play and App Store links', () => {
    expect(fallbackStoreUrl({ platform: 'android', bundleId: 'com.foo', appName: 'Foo' })).toBe(
      'https://play.google.com/store/apps/details?id=com.foo',
    );
    expect(fallbackStoreUrl({ platform: 'ios', bundleId: 'com.foo', appName: 'Foo', iosAppId: '123' })).toBe(
      'https://apps.apple.com/app/id123',
    );
  });
});
