#!/usr/bin/env lua
package.path = "./?.lua;./lua-lib/?.lua"

require 'strict'
local JSON = require 'JSON-ast'
local parse = require 'siren'
local fmt = string.format

local function read_text(filename)
    local f = io.open(filename, "r")
    if not f then error("file not found: "..filename) end
    local text = f:read("*all")
    f:close()
    return text
end


-- ast for defining commands

local metaCmds = {
  ['in-index'] = {
    ['duplicate'] = {
      -- duplicate "message"
      direct = {
        { is='text', as='message' }
      },
      args = {},
      collections = {},
      bindToArg = 'duplicate'
    },
    ['merge-on'] = {
      -- merge-on field,.. or "message"
      direct = {
        { is='word', as='field' }
      },
      args = {
        ['or'] = { is='text' }
      },
      collections = {},
      addTo = { 'mergeOn' }
    },
    ['assert'] = {
      -- assert field not-in coll or "message"
      direct = {
        { is='word', as='field' }
      },
      args = {
        ['not-in'] = { is='word-list', as='notIn', required=true },
        ['or'] = { is='text', required=true }
      },
      collections = {},
      addTo = { 'asserts' }
    },
    ['generate-id'] = {
      -- generate-id field from "str-{count}" not-in slot-ids
      -- TODO: add it to something.
      direct = {
        { is='word', as='field' }
      },
      args = {
        ['from'] = { is='text', required=true },
        ['not-in'] = { is='word-list', as='notIn' }
      },
      collections = {},
    },
  },
  ['in-cmd'] = {
    ['block'] = {
      -- allow or require this command to have a nested command block.
      -- block is|do with [cmds]
      direct = {
        { is='word', as='token' }
      },
      args = {
        ['cmds'] = { is='word', as='cmds', required=true }, -- command set.
        ['add-to'] = { is='word-list', as='addTo' }, -- convenience add-to for whole cmd-sets.
        ['with'] = { is='word-list' } -- collections to pass to commands.
      },
      collections = {},
      bindToArg = 'block',
    },
    ['direct'] = {
      -- declare a positional argument.
      -- direct [name] of [word|enum|text|number|flag] with [...enum] text ""
      direct = {
        { is='word', as='as' }
      },
      args = {
        ['of'] = { is='word', as='is', required=true },
        ['with'] = { is='word-set', as='enum' },
        ['text'] = { is='text', as='value' },
        ['alias'] = { is='word' }, -- additional local name (for shadowed arg names in nested cmds)
      },
      collections = {},
      addTo = { 'direct' }
    },
    ['arg'] = {
      -- declare a named argument.
      -- arg [name] of [word|enum|text|number|flag] as [name] required with [...enum] text ""
      direct = {
        { is='word', as='name' }
      },
      args = {
        ['of'] = { is='word', as='is', required=true },
        ['required'] = { is='flag' },
        ['as'] = { is='word' },
        ['with'] = { is='word-set', as='enum' },
        ['text'] = { is='text', as='value' },
        ['unless'] = { is='word-list' }, -- TODO: implement in the parser.
      },
      collections = {},
      addTo = { 'args' },
      notIn = { 'collections' },
    },
    ['list-arg'] = {
      -- declare a named argument list with a repeating block.
      -- list-arg [name] is ... in-cmd ... end
      block = {
        token = 'is',
        cmds = 'in-cmd',
        with = { 'collections', 'args', 'direct', 'addTo', 'ops' },
      },
      direct = {
        { is='word', as='name' }
      },
      args = {},
      collections = {
        ['args'] = { name='args', is='map', key='name', duplicate="duplicate argument name '{name}' in command: {@command}" },
        ['direct'] = { name='direct', is='list' },
        ['addTo'] = { name='addTo', is='list' },
        ['ops'] = { name='ops', is='list' },
      },
      addTo = { 'direct', 'args' },
      notIn = { 'collections' },
    },
    ['index'] = {
      -- declare a local index collection and key field.
      -- index [name] on [name] is ... in-index ... end
      block = {
        token = 'is',
        cmds = 'in-index',
        with = { 'mergeOn', 'asserts' },
      },
      direct = {
        { is='word', as='name' } -- local name of the index.
      },
      args = {
        ['on'] = { is='word', as='key', required=true }, -- name of the tuple-field to index on.
        ['field']= { is='word', as='field' }, -- name of the tuple-field to keep as the value for the key.
      },
      collections = {
        ['mergeOn'] = { name='mergeOn', is='map', key='field', duplicate="duplicate merge-on field '{field}' in command: {@command}" },
        ['asserts'] = { name='asserts', is='list' },
      },
      addTo = { 'collections' },
      notIn = { 'args' },
    },
    ['list-of'] = {
      -- declare a local list collection.
      -- list-of [name]
      direct = {
        { is='word', as='name' }
      },
      args = {},
      collections = {},
      addTo = { 'collections' },
      notIn = { 'args' },
    },
    ['expect'] = {
      -- expect matching text to follow (direct pattern match)
      direct = {
        { is='text', as='text' }
      },
      args = {},
      collections = {},
      addTo = { 'direct' },
    },
    ['match'] = {
      -- test for a literal token (direct pattern match look-ahead)
      block = {
        token = 'is',
        cmds = 'in-cmd',
        with = { 'collections', 'args', 'direct', 'addTo', 'ops' },
      },
      direct = {
        { is='text', as='text' }
      },
      args = {
        ['one-of'] = { is='word' },
        ['as'] = { is='word' },
      },
      collections = {
        ['args'] = { name='args', is='map', key='name', duplicate="duplicate argument name '{name}' in command: {@command}" },
        ['direct'] = { name='direct', is='list' },
        ['addTo'] = { name='addTo', is='list' },
        ['ops'] = { name='ops', is='list' },
      },
      addTo = { 'direct' },
    },
    ['match-token'] = {
      -- test the next token type (direct pattern match look-ahead)
      block = {
        token = 'is',
        cmds = 'in-cmd',
        with = { 'collections', 'args', 'direct', 'addTo', 'ops' },
      },
      direct = {
        { is='word', as='token' }
      },
      args = {
        ['one-of'] = { is='word' },
        ['as'] = { is='word' },
      },
      collections = {
        ['args'] = { name='args', is='map', key='name', duplicate="duplicate argument name '{name}' in command: {@command}" },
        ['direct'] = { name='direct', is='list' },
        ['addTo'] = { name='addTo', is='list' },
        ['ops'] = { name='ops', is='list' },
      },
      addTo = { 'direct' },
    },
    ['assert'] = {
      -- assert id not-in slot-ids or "temp-slot '{id}' cannot shadow a slot name" -- deferred on slot-ids
      direct = {
        { is='word', as='key' }
      },
      args = {
        ['not-in'] = { is='word-list', as='notIn', required=true }, -- local collection name (parse-time collection)
        ['or'] = { is='text', required=true },     -- error message.
      },
      collections = {},
      addTo = { 'ops' },
    },
    ['assert-field'] = {
      -- assert-field type of slot is str or "slot '{id}' must be a string slot" -- deferred on slot (after slot-ids)
      direct = {
        { is='word', as='field' }
      },
      args = {
        ['of'] = { is='word', required=true }, -- local collection name (parse-time collection)
        ['is'] = { is='word', required=true }, -- TODO: any kind of comparison value.
        ['or'] = { is='text', required=true }, -- error message.
      },
      collections = {},
      addTo = { 'ops' },
    },
    ['resolve'] = {
      -- resolve id in slot-ids as slot or "slot '{id}' not found in this scope" -- deferred on slot-ids
      direct = {
        { is='word', as='field' }                   -- local field to resolve as the resolver-key.
      },
      args = {
        ['in'] = { is='word-list', required=true }, -- local collection names (parse-time collection)
        ['with'] = { is='key-value-map' },          -- tuple to resolve (in addition to the key)
        ['as'] = { is='word' },                     -- new local bind-name (parse-time variable)
        ['or'] = { is='text' },                     -- error message if resolve is impossible.
      },
      collections = {},
      addTo = { 'ops' },
    },
    ['add-to'] = {
      -- add-to temp-slots a foo-type with id=as, type=str or "duplicate temp-slot '{id}' in this scope" -- not deferred because it adds.
      direct = {
        { is='word', as='coll' } -- local collection name (parse-time collection)
      },
      args = {
        ['a'] = { is='word' },              -- type-name of the new tuple to insert.
        ['with'] = { is='key-value-map' },  -- values to initialise the new tuple.
        ['as'] = { is='word' },             -- local name to bind with the new tuple.
        ['or'] = { is='text' },             -- error message for duplicate key.
        ['merge'] = { is='flag' },          -- merge with existing if duplicate key.
      },
      collections = {},
      addTo = { 'ops' },
    },
    ['negate'] = {
      -- set-arg [name] = [expression]
      direct = {
        { is='word', as='name' } -- local argument name.
      },
      args = {},
      collections = {},
      addTo = { 'ops' },
    },
  },
  ['in-commands'] = {
    ['cmd'] = {
      block = {
        token = 'is',
        cmds = 'in-cmd',
        with = { 'collections', 'args', 'direct', 'addTo', 'ops' },
      },
      direct = {
        { is='word', as='name' } -- cmdDef.name
      },
      args = {
        ['add-to'] = { is='word-list', as='addTo' }, -- add command result to sets.
      },
      collections = {
        ['collections'] = { name='collections', is='map', key='name', duplicate="duplicate collection name '{name}' in command: {@command}" },
        ['args'] = { name='args', is='map', key='name', duplicate="duplicate argument name '{name}' in command: {@command}" },
        ['direct'] = { name='direct', is='list' },
        ['addTo'] = { name='addTo', is='list' },
        ['ops'] = { name='ops', is='list' },
      },
      addTo = { 'cmds' },
    }
  },
  ['@'] = {
    ['commands'] = {
      block = {
        token = 'is',
        cmds = 'in-commands',
        with = { 'cmds' },
      },
      direct = {
        { is='word', as='name' } -- args.name
      },
      args = {},
      collections = {
        ['cmds'] = { name='cmds', is='map', key='name', duplicate="duplicate command name '{name}' in command-set '{@command}'" } -- args.cmds
      },
      -- yieldFrom = 'cmds', -- cmdDef.yieldFrom : the field to yield (add-to) from args tuple.
      addTo = { 'cmd-sets' },
    },
    ['argument'] = {
      -- argument parsing pattern.
      -- yields the field named in 'from', otherwise the args tuple.
      block = {
        token = 'is',
        cmds = 'in-cmd',
        with = { 'collections', 'args', 'direct', 'addTo', 'ops' },
      },
      direct = {
        { is='word', as='name' } -- args.name
      },
      args = {
        ['from'] = { is='word' } -- args.from: optional name of field to yield.
      },
      collections = {
        ['collections'] = { name='collections', is='map', key='name', duplicate="duplicate collection name '{name}' in command: {@command}" },
        ['args'] = { name='args', is='map', key='name', duplicate="duplicate argument name '{name}' in command: {@command}" },
        ['direct'] = { name='direct', is='list' },
        ['addTo'] = { name='addTo', is='list' },
        ['ops'] = { name='ops', is='list' },
      },
      addTo = { 'args-set' },
    }
  }
}

local function doth(filename, cmdSets, argSet)
  local baseDir = filename:match("(.*)[\\/]") or ""
  local text = read_text(filename)
  local ast = parse(text, cmdSets, argSet, filename)
  print(JSON:encode_pretty(ast))
end

do
  local topCollections = {
    ['cmd-sets'] = { name='cmd-sets', is='map', key='name', field='cmds', duplicate="duplicate command-set name '{name}'" },
    ['args-set'] = { name='args-set', is='map', key='name', duplicate="duplicate argument-pattern name '{name}'" },
  }
  local top = parse(read_text('demo/ast.siren'), metaCmds, {}, 'ast.siren', topCollections)
  print(JSON:encode_pretty(top))
  local cmdSets = top['cmd-sets'] or error("erk")
  local argSet = top['args-set'] or error("fie")
  if not arg[1] then print("usage: siren [in-file]"); return end
  for i,filename in ipairs(arg) do
    doth(filename, cmdSets, argSet)
  end
end
