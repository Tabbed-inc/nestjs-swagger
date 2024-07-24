import { INestApplication } from '@nestjs/common';
import { filter, find, groupBy, keyBy, mapValues, omit } from 'lodash';
import { OpenAPIObject, SwaggerDocumentOptions } from './interfaces';
import { ModuleRoute } from './interfaces/module-route.interface';

export class SwaggerTransformer {
  public normalizePaths(
    denormalizedDoc: (Partial<OpenAPIObject> & Record<'root', any>)[],
    config: Omit<OpenAPIObject, 'paths'>,
    options?: SwaggerDocumentOptions
  ): Record<'paths', OpenAPIObject['paths']> {
    const { version } = config.info;
    const { versionExtractorFactory } = options ?? {};
    const roots = filter(denormalizedDoc, (r) => r.root);
    const groupedByPath = groupBy(
      roots,
      ({ root }: Record<'root', any>) => root.path
    );

    if (versionExtractorFactory) {
      const paths = mapValues(groupedByPath, (routes) => {
        const groupedByMethod = groupBy(
          routes,
          ({ root }: Record<'root', any>) => root.method
        );
        const keyByMethod = Object.fromEntries(
          Object.entries(groupedByMethod).map(([method, routes]) => {
            const extractedVersionList = versionExtractorFactory(version);
            for (const version of extractedVersionList) {
              const found = find(
                routes,
                ({ root }: Record<'root', any>) => root.version === version
              );
              if (found) {
                return [method, found];
              }
            }
            return [method, routes[0]];
          })
        );
        return mapValues(keyByMethod, (route: any) => {
          return {
            ...omit(route.root, ['method', 'path', 'version']),
            ...omit(route, 'root')
          };
        });
      });
      return {
        paths
      };
    }

    const paths = mapValues(groupedByPath, (routes) => {
      const keyByMethod = keyBy(
        routes,
        ({ root }: Record<'root', any>) => root.method
      );
      return mapValues(keyByMethod, (route: any) => {
        return {
          ...omit(route.root, ['method', 'path']),
          ...omit(route, 'root')
        };
      });
    });
    return {
      paths
    };
  }

  public unescapeColonsInPath(
    app: INestApplication,
    moduleRoutes: ModuleRoute[]
  ): ModuleRoute[] {
    const httpAdapter = app.getHttpAdapter();
    const usingFastify = httpAdapter && httpAdapter.getType() === 'fastify';
    const unescapeColon = usingFastify
      ? (path: string) => path.replace(/:\{([^}]+)\}/g, ':$1')
      : (path: string) => path.replace(/\[:\]/g, ':');

    return moduleRoutes.map((moduleRoute) => ({
      ...moduleRoute,
      root: {
        ...moduleRoute.root,
        path: unescapeColon(moduleRoute.root.path)
      }
    }));
  }
}
