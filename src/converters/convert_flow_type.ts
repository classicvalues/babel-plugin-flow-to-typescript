import { NodePath } from '@babel/traverse';
import {
  booleanLiteral,
  FlowType,
  FunctionDeclaration,
  FunctionTypeAnnotation,
  GenericTypeAnnotation,
  Identifier,
  identifier,
  IntersectionTypeAnnotation,
  isEmptyTypeAnnotation,
  isExistsTypeAnnotation,
  isFlowType,
  isFunctionDeclaration,
  isIdentifier,
  isNumberLiteralTypeAnnotation,
  isObjectTypeProperty,
  isObjectTypeSpreadProperty,
  isQualifiedTypeIdentifier,
  isTSTypeParameter,
  isTypeAnnotation,
  NumberLiteralTypeAnnotation,
  numericLiteral,
  ObjectTypeAnnotation,
  ObjectTypeProperty,
  restElement,
  RestElement,
  stringLiteral,
  StringLiteralTypeAnnotation,
  tsAnyKeyword,
  tsArrayType,
  tsBooleanKeyword,
  TSEntityName,
  tsFunctionType,
  tsIndexedAccessType,
  tsIndexSignature,
  tsIntersectionType,
  tsLiteralType,
  tsNeverKeyword,
  tsNullKeyword,
  tsNumberKeyword,
  tsPropertySignature,
  tsQualifiedName,
  tsStringKeyword,
  tsThisType,
  TSType,
  tsTypeAnnotation,
  TSTypeAnnotation,
  TSTypeElement,
  tsTypeLiteral,
  tsTypeOperator,
  tsTypeParameter,
  tsTypeParameterDeclaration,
  TSTypeParameterInstantiation,
  tsTypeParameterInstantiation,
  tsTypeReference,
  tsUndefinedKeyword,
  tsUnionType,
  tsVoidKeyword,
  tsTupleType,
  TypeofTypeAnnotation,
  tsUnknownKeyword,
} from '@babel/types';
import { generateFreeIdentifier, UnsupportedError, warnOnlyOnce } from '../util';
import { convertFlowIdentifier } from './convert_flow_identifier';

export function convertFlowType(path: NodePath<FlowType>): TSType {
  if (path.isAnyTypeAnnotation()) {
    return tsAnyKeyword();
  }

  if (path.isArrayTypeAnnotation()) {
    return tsArrayType(convertFlowType(path.get('elementType')));
  }

  if (path.isBooleanTypeAnnotation()) {
    return tsBooleanKeyword();
  }

  if (path.isBooleanLiteralTypeAnnotation()) {
    return tsLiteralType(booleanLiteral(path.node.value!));
  }

  if (isEmptyTypeAnnotation(path)) {
    return tsNeverKeyword();
  }

  if (isExistsTypeAnnotation(path)) {
    warnOnlyOnce(
      'Existential type (*) in Flow is converted to "any" in TypeScript, and this conversion loses some type information.',
    );
    return tsAnyKeyword();
  }

  if (path.isGenericTypeAnnotation()) {
    const typeParameterPath = path.get('typeParameters');
    let tsTypeParameters: TSTypeParameterInstantiation | null = null;
    if (typeParameterPath.node) {
      const tsParams = typeParameterPath.node.params.map((_, i) =>
        convertFlowType(typeParameterPath.get(`params.${i}`) as NodePath<FlowType>),
      );
      tsTypeParameters = tsTypeParameterInstantiation(tsParams);
    }

    const id = (path as NodePath<GenericTypeAnnotation>).node.id;
    if (isIdentifier(id) && id.name === '$Keys') {
      // $Keys -> keyof
      const ret = tsTypeOperator(tsTypeParameters!.params[0]);
      ret.operator = 'keyof';
      return ret;
    } else if (isIdentifier(id) && id.name === '$Values') {
      // $Values<X> -> X[keyof X]
      const tsType = tsTypeParameters!.params[0];
      const tsKey = tsTypeOperator(tsType);
      tsKey.operator = 'keyof';
      return tsIndexedAccessType(tsType, tsKey);
    } else if (isIdentifier(id) && id.name === '$ReadOnly') {
      // $ReadOnly<X> -> Readonly<X>
      return tsTypeReference(identifier('Readonly'), tsTypeParameters);
    } else if (isIdentifier(id) && id.name === '$ReadOnlyArray') {
      // $ReadOnlyArray<X> -> ReadonlyArray<X>
      return tsTypeReference(identifier('ReadonlyArray'), tsTypeParameters);
    } else if (isIdentifier(id) && id.name === '$Exact') {
      warnOnlyOnce(
        "Exact object type annotation in Flow is ignored. In TypeScript, it's always regarded as exact type",
      );
      return tsTypeParameters!.params[0];
    } else if (isIdentifier(id) && id.name === '$Diff') {
      // $Diff<X, Y> -> Pick<X, Exclude<keyof X, keyof Y>>
      const [tsX, tsY] = tsTypeParameters!.params;
      const tsKeyofX = tsTypeOperator(tsX);
      const tsKeyofY = tsTypeOperator(tsY);
      tsKeyofX.operator = 'keyof';
      tsKeyofY.operator = 'keyof';
      const tsExclude = tsTypeReference(
        identifier('Exclude'),
        tsTypeParameterInstantiation([tsKeyofX, tsKeyofY]),
      );
      return tsTypeReference(identifier('Pick'), tsTypeParameterInstantiation([tsX, tsExclude]));
    } else if (isIdentifier(id) && id.name === '$Rest') {
      throw new UnsupportedError('$Rest in GenericTypeAnnotation');
    } else if (isIdentifier(id) && id.name === '$PropertyType') {
      // $PropertyType<T, k> -> T[k]
      // TODO: $PropertyType<T, k> -> k extends string ? T[k] : never
      const [tsT, tsK] = tsTypeParameters!.params;
      return tsIndexedAccessType(tsT, tsK);
    } else if (isIdentifier(id) && id.name === '$ElementType') {
      // $ElementType<T, k> -> T[k]
      const [tsT, tsK] = tsTypeParameters!.params;
      return tsIndexedAccessType(tsT, tsK);
    } else if (isIdentifier(id) && id.name === '$Shape') {
      // $Shape<T> -> Partial<T>
      return tsTypeReference(identifier('Partial'), tsTypeParameters);
    } else if (isIdentifier(id) && id.name === 'Class') {
      // Class<T> -> typeof T
      const tsType = tsTypeParameters!.params[0];
      const tsTypeofT = tsTypeOperator(tsType);
      tsTypeofT.operator = 'typeof';
      return tsTypeofT;
      // @ts-ignore
    } else if (isIdentifier(id) && id.name === '$FlowFixMe') {
      return tsTypeReference(identifier('any'), tsTypeParameters);
    } else if (isIdentifier(id) && id.name === 'Object') {
      // todo: return tsObjectKeyword();
      const id = identifier('x');
      id.typeAnnotation = tsTypeAnnotation(tsStringKeyword());
      return tsTypeLiteral([tsIndexSignature([id], tsTypeAnnotation(tsAnyKeyword()))]);
    } else if (id.type === 'QualifiedTypeIdentifier') {
      // return tsTypeReference(identifier(`${id.qualification.name}.${id.id.name}`));
      // @ts-ignore
      return tsTypeReference(
        // @ts-ignore
        identifier(`${id.qualification.name}.${id.id.name}`),
        tsTypeParameters,
      );
    } else if (isQualifiedTypeIdentifier(id)) {
      // todo:
      if (isQualifiedTypeIdentifier(id.qualification)) {
        throw path.buildCodeFrameError('Nested qualification is not supported', UnsupportedError);
      }
      const tsQ = tsQualifiedName(id.qualification as TSEntityName, id.id);
      return tsTypeReference(tsQ, tsTypeParameters);
    } else {
      return tsTypeReference(convertFlowIdentifier(id), tsTypeParameters);
    }
    //TODO: $ObjMap<T, F>, $TupleMap<T, F>, $Call<F>, $Supertype<T>, $Subtype<T>
  }

  if (path.isIntersectionTypeAnnotation()) {
    const flowTypes = (path as NodePath<IntersectionTypeAnnotation>).node.types;
    return tsIntersectionType(
      flowTypes.map((_, i) =>
        convertFlowType((path as NodePath<IntersectionTypeAnnotation>).get(
          `types.${i}`,
        ) as NodePath<FlowType>),
      ),
    );
  }

  if (path.isMixedTypeAnnotation()) {
    return tsUnknownKeyword();
  }

  if (path.isNullableTypeAnnotation()) {
    const tsT = convertFlowType(path.get('typeAnnotation'));

    // Note: for convenience, path stack is stacked in order that parent item is located before child one.
    const pathStack: NodePath[] = [path];
    while (
      isFlowType(pathStack[0].node) ||
      isTypeAnnotation(pathStack[0].node) ||
      isIdentifier(pathStack[0].node)
    ) {
      pathStack.unshift(pathStack[0].parentPath);
    }

    if (isFunctionDeclaration(pathStack[0].node)) {
      if (pathStack[1].node === (pathStack[0].node as FunctionDeclaration).returnType) {
        // f(): ?T {} -> f(): T | null | undefined {}
        return tsUnionType([tsT, tsUndefinedKeyword(), tsNullKeyword()]);
      } else {
        // Type annotation for function parameter
        const identifierPath = pathStack[1] as NodePath<Identifier>;
        if (identifierPath.node.optional) {
          // ( arg?: ?T ) -> ( arg?: T | null )
          return tsUnionType([tsT, tsNullKeyword()]);
        } else {
          const argumentIndex = (pathStack[0].node as FunctionDeclaration).params.indexOf(
            identifierPath.node,
          );

          if (
            (pathStack[0].node as FunctionDeclaration).params
              .slice(argumentIndex)
              .every(node => (node as Identifier).optional!)
          ) {
            // TODO:
            // In Flow, required parameter which accepts undefined also accepts missing value,
            // if the missing value is automatically filled with undefined.
            // (= No required parameters are exist after the parameter).
            //
            // TypeScript doesn't allow missing value for parameter annotated with undefined.
            // Therefore we need to modify the parameter as optional.
            //
            // f( arg: ?T ) -> f( arg?: T | null )
            return tsUnionType([tsT, tsUndefinedKeyword(), tsNullKeyword()]);
          } else {
            // Some required parameters are exist after this parameter.
            // f( arg1: ?T, arg2: U ) -> f( arg1: T | null | undefined, arg2: U )
            return tsUnionType([tsT, tsUndefinedKeyword(), tsNullKeyword()]);
          }
        }
      }
    }

    if (isObjectTypeProperty(pathStack[0].node)) {
      if ((pathStack[0].node as ObjectTypeProperty).optional) {
        // { key?: ?T } -> { key?: T | null }
        return tsUnionType([tsT, tsNullKeyword()]);
      } else {
        // { key: ?T } -> { key: T | null | undefined }
        return tsUnionType([tsT, tsUndefinedKeyword(), tsNullKeyword()]);
      }
    }

    // var x: X<?T> -> var x: X<T | null | undefined>
    // var x:?T -> var x:T | null | undefined
    return tsUnionType([tsT, tsUndefinedKeyword(), tsNullKeyword()]);
  }

  if (path.isNullLiteralTypeAnnotation()) {
    return tsNullKeyword();
  }

  if (isNumberLiteralTypeAnnotation(path)) {
    return tsLiteralType(
      numericLiteral((path as NodePath<NumberLiteralTypeAnnotation>).node.value!),
    );
  }

  if (path.isNumberTypeAnnotation()) {
    return tsNumberKeyword();
  }

  if (path.isObjectTypeAnnotation()) {
    const members: TSTypeElement[] = [];
    const spreads: TSType[] = [];

    const objectTypeNode = path.node as ObjectTypeAnnotation;
    if (objectTypeNode.exact) {
      warnOnlyOnce(
        "Exact object type annotation in Flow is ignored. In TypeScript, it's always regarded as exact type",
      );
      objectTypeNode.exact = false;
    }

    if (objectTypeNode.properties && objectTypeNode.properties.length > 0) {
      for (const [i, property] of objectTypeNode.properties.entries()) {
        if (isObjectTypeProperty(property)) {
          const tsPropSignature = tsPropertySignature(
            property.key,
            tsTypeAnnotation(
              convertFlowType(path.get(`properties.${i}.value`) as NodePath<FlowType>),
            ),
          );
          tsPropSignature.optional = property.optional;
          tsPropSignature.readonly = property.variance && property.variance.kind === 'plus';
          tsPropSignature.innerComments = property.innerComments;
          tsPropSignature.leadingComments = property.leadingComments;
          tsPropSignature.trailingComments = property.trailingComments;
          members.push(tsPropSignature);
        }

        if (isObjectTypeSpreadProperty(property)) {
          // {p1:T, ...U} -> {p1:T} | U
          spreads.push(convertFlowType(path.get(`properties.${i}.argument`) as NodePath<FlowType>));
        }
      }
    }

    if (objectTypeNode.indexers && objectTypeNode.indexers.length > 0) {
      for (const [i, indexer] of objectTypeNode.indexers.entries()) {
        const tsIndex = indexer.id || identifier('x');
        tsIndex.typeAnnotation = tsTypeAnnotation(
          convertFlowType(path.get(`indexers.${i}.key`) as NodePath<FlowType>),
        );
        const member = tsIndexSignature(
          [tsIndex],
          tsTypeAnnotation(convertFlowType(path.get(`indexers.${i}.value`) as NodePath<FlowType>)),
        );
        members.push(member);
      }
    }

    if (objectTypeNode.callProperties && objectTypeNode.callProperties.length > 0) {
      throw new UnsupportedError('TSCallSignatureDeclaration');
      // TODO
      // for (const [i, callProperty] of objectTypeNode.callProperties.entries()) {
      //     //parameters: Array<Identifier>, typeAnnotation?: TSTypeAnnotation | null, readonly?: boolean | null
      //     const tsIndex = indexer.id || identifier('x');
      //     tsIndex.typeAnnotation = tsTypeAnnotation(convertFlowType(path.get(`indexers.${i}`).get('key') as NodePath<FlowType>));
      //     const member = tsCallSignatureDeclaration([tsIndex], tsTypeAnnotation(convertFlowType(path.get(`indexers.${i}`).get('value') as NodePath<FlowType>)));
      //     members.push(member);
      // }
    }

    // TSCallSignatureDeclaration | TSConstructSignatureDeclaration | TSMethodSignature ;

    let ret: TSType = tsTypeLiteral(members);

    if (spreads.length > 0) {
      spreads.unshift(ret);
      ret = tsIntersectionType(spreads);
    }

    return ret;
  }

  if (path.isStringLiteralTypeAnnotation()) {
    return tsLiteralType(
      stringLiteral((path as NodePath<StringLiteralTypeAnnotation>).node.value!),
    );
  }

  if (path.isStringTypeAnnotation()) {
    return tsStringKeyword();
  }

  if (path.isThisTypeAnnotation()) {
    return tsThisType();
  }

  if (path.isTypeofTypeAnnotation()) {
    const typeOp = tsTypeOperator(
      convertFlowType((path as NodePath<TypeofTypeAnnotation>).get('argument')),
    );
    typeOp.operator = 'typeof';
    return typeOp;
  }

  if (path.isUnionTypeAnnotation()) {
    const flowTypes = path.node.types;
    return tsUnionType(
      flowTypes.map((_, i) => convertFlowType(path.get(`types.${i}`) as NodePath<FlowType>)),
    );
  }

  if (path.isVoidTypeAnnotation()) {
    return tsVoidKeyword();
  }

  if (path.isFunctionTypeAnnotation()) {
    // https://github.com/bcherny/flow-to-typescript/blob/f1dbe3d1f97b97d655ea6c5f1f5caaaa9f1e0c9f/src/convert.ts
    const node = (path as NodePath<FunctionTypeAnnotation>).node;
    let typeParams = undefined;

    if (node.typeParameters) {
      typeParams = tsTypeParameterDeclaration(
        node.typeParameters.params.map((_, i) => {
          // TODO: How is this possible?
          if (isTSTypeParameter(_)) {
            return _;
          }

          const param = tsTypeParameter(
            convertFlowType(path.get(`typeParameters.params.${i}.bound`) as NodePath<FlowType>),
          );
          param.name = _.name;
          return param;
        }),
      );
    }

    let parameters: Array<Identifier | RestElement> = [];
    let typeAnnotation: TSTypeAnnotation | null = null;

    // Params
    if (node.params) {
      const paramNames = node.params
        .map(_ => _.name)
        .filter(_ => _ !== null)
        .map(_ => (_ as Identifier).name);
      parameters = node.params.map((_, i) => {
        let name = _.name && _.name.name;

        // Generate param name? (Required in TS, optional in Flow)
        if (name == null) {
          // todo: generate it from type?
          name = generateFreeIdentifier(paramNames);
          paramNames.push(name);
        }

        const id = identifier(name);
        id.optional = _.optional;
        if (_.typeAnnotation) {
          id.typeAnnotation = tsTypeAnnotation(
            convertFlowType(path.get(`params.${i}.typeAnnotation`) as NodePath<FlowType>),
          );
        }

        return id;
      });
    }

    // rest parameters
    if (node.rest) {
      if (node.rest.name) {
        const id = restElement(node.rest.name);
        id.typeAnnotation = tsTypeAnnotation(
          convertFlowType(path.get(`rest.typeAnnotation`) as NodePath<FlowType>),
        );
        parameters.push(id);
      }
    }

    // Return type
    if (node.returnType) {
      typeAnnotation = tsTypeAnnotation(convertFlowType(path.get('returnType')));
    }
    return tsFunctionType(typeParams, parameters, typeAnnotation);
  }

  if (path.isTupleTypeAnnotation()) {
    const flowTypes = path.node.types;
    return tsTupleType(
      flowTypes.map((_, i) => convertFlowType(path.get(`types.${i}`) as NodePath<FlowType>)),
    );
  }

  throw new UnsupportedError(`FlowType(type=${path.node.type})`);
}
