export function toFxTools(definitions, runCall) {
  return definitions.map(definition => ({
    name: definition.name,
    description: definition.description,
    inputSchema: definition.parameters,
    execute: (input, context) => runCall(definition.name, input, context),
  }))
}
