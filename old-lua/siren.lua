
local fmt = string.format

local function parseError(message, self)
  message = string.format("%s at line %d in %q", message, self.line, self.filename)
  assert(false, message)
end


-- parse_string and unicode_codepoint_as_utf8 from:
-- Simple JSON encoding and decoding in pure Lua.
-- Copyright 2010-2014 Jeffrey Friedl
-- http://regex.info/blog/

local function unicode_codepoint_as_utf8(codepoint)
   --
   -- codepoint is a number
   --
   if codepoint <= 127 then
      return string.char(codepoint)

   elseif codepoint <= 2047 then
      --
      -- 110yyyxx 10xxxxxx         <-- useful notation from http://en.wikipedia.org/wiki/Utf8
      --
      local highpart = math.floor(codepoint / 0x40)
      local lowpart  = codepoint - (0x40 * highpart)
      return string.char(0xC0 + highpart,
                         0x80 + lowpart)

   elseif codepoint <= 65535 then
      --
      -- 1110yyyy 10yyyyxx 10xxxxxx
      --
      local highpart  = math.floor(codepoint / 0x1000)
      local remainder = codepoint - 0x1000 * highpart
      local midpart   = math.floor(remainder / 0x40)
      local lowpart   = remainder - 0x40 * midpart

      highpart = 0xE0 + highpart
      midpart  = 0x80 + midpart
      lowpart  = 0x80 + lowpart

      --
      -- Check for an invalid character (thanks Andy R. at Adobe).
      -- See table 3.7, page 93, in http://www.unicode.org/versions/Unicode5.2.0/ch03.pdf#G28070
      --
      if ( highpart == 0xE0 and midpart < 0xA0 ) or
         ( highpart == 0xED and midpart > 0x9F ) or
         ( highpart == 0xF0 and midpart < 0x90 ) or
         ( highpart == 0xF4 and midpart > 0x8F )
      then
         return "?"
      else
         return string.char(highpart,
                            midpart,
                            lowpart)
      end

   else
      --
      -- 11110zzz 10zzyyyy 10yyyyxx 10xxxxxx
      --
      local highpart  = math.floor(codepoint / 0x40000)
      local remainder = codepoint - 0x40000 * highpart
      local midA      = math.floor(remainder / 0x1000)
      remainder       = remainder - 0x1000 * midA
      local midB      = math.floor(remainder / 0x40)
      local lowpart   = remainder - 0x40 * midB

      return string.char(0xF0 + highpart,
                         0x80 + midA,
                         0x80 + midB,
                         0x80 + lowpart)
   end
end

local function parse_string(self, text, start, argName, command)
   if text:sub(start,start) ~= '"' then
      parseError(fmt("expecting a quoted string for argument %q in command %q", argName, command), self)
   end

   local i = start + 1 -- +1 to bypass the initial quote
   local text_len = text:len()
   local VALUE = ""
   while i <= text_len do
      local c = text:sub(i,i)
      if c == '"' then
         return VALUE, i + 1
      end
      if c ~= '\\' then
         VALUE = VALUE .. c
         i = i + 1
      elseif text:match('^\\b', i) then
         VALUE = VALUE .. "\b"
         i = i + 2
      elseif text:match('^\\f', i) then
         VALUE = VALUE .. "\f"
         i = i + 2
      elseif text:match('^\\n', i) then
         VALUE = VALUE .. "\n"
         i = i + 2
      elseif text:match('^\\r', i) then
         VALUE = VALUE .. "\r"
         i = i + 2
      elseif text:match('^\\t', i) then
         VALUE = VALUE .. "\t"
         i = i + 2
      else
         local hex = text:match('^\\u([0123456789aAbBcCdDeEfF][0123456789aAbBcCdDeEfF][0123456789aAbBcCdDeEfF][0123456789aAbBcCdDeEfF])', i)
         if hex then
            i = i + 6 -- bypass what we just read

            -- We have a Unicode codepoint. It could be standalone, or if in the proper range and
            -- followed by another in a specific range, it'll be a two-code surrogate pair.
            local codepoint = tonumber(hex, 16)
            if codepoint >= 0xD800 and codepoint <= 0xDBFF then
               -- it's a hi surrogate... see whether we have a following low
               local lo_surrogate = text:match('^\\u([dD][cdefCDEF][0123456789aAbBcCdDeEfF][0123456789aAbBcCdDeEfF])', i)
               if lo_surrogate then
                  i = i + 6 -- bypass the low surrogate we just read
                  codepoint = 0x2400 + (codepoint - 0xD800) * 0x400 + tonumber(lo_surrogate, 16)
               else
                  -- not a proper low, so we'll just leave the first codepoint as is and spit it out.
               end
            end
            VALUE = VALUE .. unicode_codepoint_as_utf8(codepoint)

         else

            -- just pass through what's escaped
            VALUE = VALUE .. text:match('^\\(.)', i)
            i = i + 2
         end
      end
   end

   parseError(fmt("unclosed string in argument %q in command %q",argName,command), self)
end



-- New code, not based on Simple JSON encoder.
-- Copyright 2017 Andrew Towers

local next_node_id = 1

local function skip_space(text, start)
   local _, end_space = text:find("^[ \t]+", start)
   return end_space and end_space + 1 or start
end

local function at_end_of_line(text, start)
  -- true if a comment or end-of-line follows.
  return text:find("^%-%-", start) or text:find("^[\r\n]", start)
end

local function match_end_of_line(self, text, start)
  start = skip_space(text, start)
  if text:match("^%-%-", start) then
    -- skip the rest of the line.
    local _, eol_end = text:find("\r\n?", start+2)
    if not eol_end then _, eol_end = text:find("\n", start+2) end
    if not eol_end then eol_end = text:len() end
    start = eol_end + 1
    self.line = self.line + 1
    return true, start
  else
    -- is this the end of a line?
    local _, eol_end = text:find("^\r\n?", start)
    if not eol_end then _, eol_end = text:find("^\n", start) end
    if eol_end then
      start = eol_end + 1
      self.line = self.line + 1
      return true, start
    else
      return false, start
    end
  end
end

local function parse_number(self, text, start, argName, command)
  local _, end_int = text:find('^-?%d+', start)
  if end_int == nil then
    parseError(fmt("expecting a number for argument %q in command %q", argName, command), self)
  end
  local _, end_frac = text:find('^%.%d+', end_int + 1)
  local _, end_exp = text:find('^[eE][+-]?%d+', (end_frac or end_int) + 1)
  local end_num = end_exp or end_frac or end_int
  return tonumber(text:sub(start, end_num)), end_num + 1
end

-- print(parse_number({}, '-22x', 1, 'foo', 'foo'))
-- print(parse_number({}, '-22.7x', 1, 'foo', 'foo'))
-- print(parse_number({}, '-22.752e2x', 1, 'foo', 'foo'))

local function parse_cmd_name(self, text, start)
  local word = text:match("^[@%a][%a%-.]*", start)
  if not word then
    parseError("expecting a command name", self)
  end
  return word, start + word:len()
end

local function parse_arg_name(self, text, start, command)
  local word = text:match("^%a[%a%-]*", start)
  if not word then
    parseError(fmt("expecting an argument name in command %q",command), self)
  end
  return word, start + word:len()
end

local function parse_symbol(self, text, start, argName, command)
  local word = text:match("^[@%a%d%-%+%*%/%%.]+", start)
  if not word then
    parseError(fmt("value for %q in command %q must be a symbolic name",argName,command), self)
  end
  return word, start + word:len()
end

local function join_keys(map)
  local s = ""
  local sep = ""
  for key, val in pairs(map) do
    s = s .. sep .. tostring(key)
    sep = ", "
  end
  return s
end

function runOps(self, context, args, ops, command)
  for i,op in ipairs(ops) do
    print("op: "..op['@'], op.as, "in "..command)
    if op.as then
      if args[op.as] then error(fmt("panic: %s: duplicate 'as' field name %q in command: %s", op['@'], op.as, command)) end
      args[op.as] = new { unresolved=true }
    end
  end
end

local parse_spec -- set below

local function parse_arg_pattern(self, context, text, start, argDef, argName, command)
  -- direct argument values.
  local tuple = {}
  for i, argSpec in ipairs(argDef.direct) do
    local asName = argSpec.as
    if asName then
      -- direct [as] of [spec]
      tuple[asName], start = parse_spec(self, context, text, start, argSpec, 'argument '..tostring(i), command)
    else
      local pattern = argSpec.text
      if pattern then
        -- match [text]
        start = skip_space(text, start)
        -- TODO: gsub '%' -> '%%' and prefix with '^' at parse-time.
        print(start)
        if text:sub(start, start + #pattern - 1) ~= pattern then
          parseError(fmt("expecting %q in argument %q in command %q", pattern, argName, command), self)
        end
        start = start + #pattern
      else
        error(fmt("panic: missing 'as' or 'text' in spec for direct %d in argument-pattern %q", i, argDef.name))
      end
    end
  end
  -- TODO: chomp all named arguments that match?
  if argDef.ops then
    -- FIXME: do something with the ops.
    -- here put something in args for the 'as' field of 'resolve' ops.
    runOps(self, context, tuple, argDef.ops, command)
  end
  -- yield the argument results.
  local yieldFrom = argDef.from
  local result = yieldFrom and tuple[yieldFrom] or tuple
  if result == nil then
    error(fmt("panic: yield-from field %q is missing from the result tuple in argument pattern %q", yieldFrom, argDef.name))
  end
  return result, start
end

parse_spec = function(self, context, text, start, spec, argName, command)
  start = skip_space(text, start)
  print(fmt("arg %q of cmd %q 'is' value %q", argName, command, spec.is))
  if spec.is == 'word' then
    return parse_symbol(self, text, start, argName, command)

  elseif spec.is == 'enum' then
    local res
    res, start = parse_symbol(self, text, start, argName, command)
    if not spec.enum[res] then
      local vals = join_keys(spec.enum)
      parseError(fmt("value for %q in command %q must be one of: %s",argName,command,vals), self)
    end
    return res, start

  elseif spec.is == 'text' then
    return parse_string(self, text, start, argName, command)

  elseif spec.is == 'number' then
    return parse_number(self, text, start, argName, command)

  elseif spec.is == 'flag' then
    return true, start -- no value follows.

  elseif spec.is == 'value' then
    return spec.value, start -- no value follows.

  elseif spec.is == 'word-list' then
    -- one or more words separated with commas.
    local word
    word, start = parse_symbol(self, text, start, argName, command)
    local words = { word }
    local text_len = text:len()
    while start <= text_len do
      start = skip_space(text, start)
      if not text:find("^,", start) then break end
      start = skip_space(text, start + 1)
      word, start = parse_symbol(self, text, start, argName, command)
      words[#words+1] = word
    end
    return words, start

  elseif spec.is == 'word-set' then
    -- one or more words separated with commas.
    local word
    word, start = parse_symbol(self, text, start, argName, command)
    local set = { [word]=true }
    local text_len = text:len()
    while start <= text_len do
      start = skip_space(text, start)
      if not text:find("^,", start) then break end
      start = skip_space(text, start + 1)
      word, start = parse_symbol(self, text, start, argName, command)
      set[word] = true
    end
    return set, start

  elseif spec.is == 'enum-set' then
    -- one or more enum words separated with commas.
    local word
    word, start = parse_symbol(self, text, start, argName, command)
    if not spec.enum[word] then
      local vals = join_keys(spec.enum)
      parseError(fmt("value for %q in command %q must be one of: %s", argName, command, vals), self)
    end
    local set = { [word]=true }
    local text_len = text:len()
    while start <= text_len do
      start = skip_space(text, start)
      if not text:find("^,", start) then break end
      start = skip_space(text, start + 1)
      word, start = parse_symbol(self, text, start, argName, command)
      if not spec.enum[word] then
        local vals = join_keys(spec.enum)
        parseError(fmt("value for %q in command %q must be one of: %s", argName, command, vals), self)
      end
      set[word] = true
    end
    return set, start

  elseif spec.is == 'key-value-map' then
    -- one or more [key=value] pairs separated with commas.
    -- FIXME: replace with a user-defined argument format.
    local function key_and_val()
      local key, val
      key, start = parse_symbol(self, text, start, argName, command)
      if not text:find("^=", start) then
        parseError(fmt("expecting '=' in key-value argument %q in command %q", argName, command), self)
      end
      val, start = parse_symbol(self, text, start + 1, argName, command)
      return key, val
    end
    local key, val = key_and_val()
    local map = { [key]=val }
    local text_len = text:len()
    while start <= text_len do
      start = skip_space(text, start)
      if not text:find("^,", start) then break end
      start = skip_space(text, start + 1)
      local key, val = key_and_val()
      map[key] = val
    end
    return map, start

  elseif spec.is == 'xx-slot-and-ofs' then
    -- FIXME: replace with a user-defined argument format.
    local slot; local ofs = 0
    slot, start = parse_symbol(self, text, start, argName, command)
    start = skip_space(text, start)
    if not at_end_of_line(text, start) then
      local sign, end_sign = parse_symbol(self, text, start, argName, command)
      if sign == '+' or sign == '-' then
        start = skip_space(text, end_sign)
        ofs, start = parse_number(self, text, start, argName, command)
        if sign == '-' then ofs = -ofs end
      end
    end
    return { slot=slot, ofs=ofs }, start

  elseif spec.is == 'xx-number-pair' then
    -- FIXME: replace with a user-defined argument format.
    local left, right
    left, start = parse_symbol(self, text, start, argName, command)
    if not text:find("^:", start) then
      parseError(fmt("expecting ':' in number-pair argument %q in command %q", argName, command), self)
    end
    right, start = parse_symbol(self, text, start + 1, argName, command)
    return { left, right }, start

  elseif spec.is == 'name-as-to-map' then
    -- one or more [name as|to name] pairs separated with commas.
    -- FIXME: replace with a user-defined argument format.
    local function key_and_val()
      local src, mode, dest
      src, start = parse_symbol(self, text, start, argName, command)
      start = skip_space(text, start)
      mode, start = parse_symbol(self, text, start, argName, command)
      if mode ~= 'as' and mode ~= 'to' then
        parseError(fmt("expecting 'as' or 'to' in name-as-to-map argument %q in command %q", argName, command), self)
      end
      start = skip_space(text, start)
      dest, start = parse_symbol(self, text, start, argName, command)
      return src, mode, dest
    end
    local src, mode, dest = key_and_val()
    local list = { { src, mode, dest } }
    local text_len = text:len()
    while start <= text_len do
      start = skip_space(text, start)
      if not text:find("^,", start) then break end
      start = skip_space(text, start + 1)
      local src, mode, dest = key_and_val()
      list[#list+1] = { src, mode, dest }
    end
    return list, start

  else
    -- argument patterns.
    local argDef = self.argSet[spec.is]
    if argDef then
      return parse_arg_pattern(self, context, text, start, argDef, argName, command)
    end

    parseError(fmt("unknown argument-pattern %q in definition of argument %q in command %q", spec.is, argName, command), self)
  end
end

local function expand_text(message, tuple, builtins)
  return message:gsub('{([^}]+)}', function (s)
    return tuple[s] or builtins[s] or '{#'..s..'#}'
  end)
end

local function commandPath(context, command)
  local path = command
  while context ~= false do
    path = path .. " < " .. context.command
    context = context.context -- walk up the chain.
  end
  return path
end

local function resolveCollection(self, context, name, command, o_cmdDef, o_args)
  if o_cmdDef then
    local colDef = o_cmdDef.collections[name]
    if colDef then
      -- local collection declared in this command.
      local colObj = o_args[name] or error(fmt("panic: collection %q is missing from local args, in definition of command: %s", name, commandPath(context,command)))
      return colDef, colObj
    end
  end
  -- collection from the 'with' clause of the parent command's 'block'.
  local colDef = context.colDefs[name] or error(fmt("panic: collection %q not found in command: %s", name, commandPath(context,command)))
  local colObj = context.colObjs[name] or error(fmt("panic: collection %q is missing from context.tuple, in command: %s", name, commandPath(context,command)))
  return colDef, colObj
end

local function addToCollections(self, context, addTo, tuple, command, o_cmdDef, o_args)
  -- add a tuple to zero or more named collections in context.
  for i,name in ipairs(addTo) do
    local cdef, collection = resolveCollection(self, context, name, command, o_cmdDef, o_args)
    local value = tuple
    if cdef.field then
      value = tuple[cdef.field] or parseError(fmt("missing value-field %q in tuple added to collection %q in command: %s", cdef.field, name, commandPath(context,command)), self)
    end
    if cdef.key then
      -- index collection
      local key = tuple[cdef.key] or parseError(fmt("missing key-field %q in tuple added to collection %q in command: %s", cdef.key, name, commandPath(context,command)), self)
      print(fmt("add-to %q key %q = %q (%s)", name, cdef.key, key, commandPath(context,command)))
      if collection[key] then
        -- parse error: key already exists in this 'add-to' collections.
        local msg = cdef['duplicate'] or fmt("duplicate key %q (field '{@key}') added to collection '{@coll}' in command: {@command}", key)
        parseError(expand_text(msg, tuple, {['@command']=commandPath(context,command),['@coll']=name,['@key']=cdef.key}), self)
      end
      collection[key] = value
    else
      -- list-of collection
      collection[#collection+1] = value
    end
  end
end

local parse_block -- set below.

local function parse_command(self, text, start, cmdMap, context)

  local eol, command, argName

  -- handle blank line or comment.
  eol, start = match_end_of_line(self, text, start)
  if eol then
    return nil, false, start
  end

  -- command word.
  command, start = parse_cmd_name(self, text, start)
  print(command)

  if command == 'end' then
    if context.canEnd then
      return nil, true, start
    else
      parseError('unexpected "end" command', self)
    end
  end

  local cmdDef = cmdMap[command]
  if not cmdDef then
    parseError(fmt("unknown command %q",command), self)
  end

  local id = fmt('%d:%s', next_node_id, command)
  next_node_id = next_node_id + 1

  local args = { ['@']=command, ['@id']=id }
  local seen = {}
  local hasBlock = false
  local block = cmdDef.block
  local endToken = block and block.token or ''

  -- direct argument values.
  for i, argSpec in ipairs(cmdDef.direct) do
    local asName = argSpec.as or error(fmt("panic: missing 'as' in spec for direct argument %d in command %q", i, command))
    args[asName], start = parse_spec(self, context, text, start, argSpec, 'argument '..tostring(i), command)
  end

  -- keyword arguments.
  local text_len = text:len()
  while start <= text_len do

    -- check for end of the command.
    eol, start = match_end_of_line(self, text, start)
    if eol then
      break
    end

    -- argument name.
    argName, start = parse_arg_name(self, text, start, command)
    if seen[argName] then
      parseError("duplicate argument '"..argName.."' in command '"..command.."'", self)
    end
    if argName == endToken then
      hasBlock = true
      break -- end of command and beginning of nested block.
    end
    seen[argName] = true
    local argSpec = cmdDef.args[argName]
    if not argSpec then
      parseError("unknown argument '"..argName.."' in command '"..command.."'", self)
    end

    -- argument value.
    local asName = argSpec.as or argName
    args[asName], start = parse_spec(self, context, text, start, argSpec, argName, command)

  end

  -- ensure all required arguments were specified.
  for argName, argSpec in pairs(cmdDef.args) do
    if argSpec.required and not seen[argName] then
      parseError("missing argument '"..argName.."' in command '"..command.."'", self)
    end
  end

  -- create all local collections.
  for name, _ in pairs(cmdDef.collections) do
    args[name] = {}
  end

  -- parse nested commands if this is a block-command.
  if block then
    if not hasBlock then
      parseError(fmt("expecting block-token %q at end of command %q", endToken, command), self)
    end
    local innerCmds = cmdMap
    if block.cmds then
      innerCmds = self.cmdSet[block.cmds] or error(fmt("panic: non-existent command-set %q specified in definition of command %q", block.cmds, command))
    end
    local withColDef = {}
    local withColObj = {}
    if block.with then
      -- forward collections to commands inside the command block.
      -- TODO: validate collections when making the command-set.
      for _, name in ipairs(block.with) do
        local colDef, colObj = resolveCollection(self, context, name, command, cmdDef, args)
        withColDef[name] = colDef
        withColObj[name] = colObj
      end
    end
    local innerCtx = new { colDefs=withColDef, colObjs=withColObj, tuple=args, command=command, canEnd=true, context=context }
    local resultList
    resultList, start = parse_block(self, text, start, innerCmds, innerCtx)
    if block.addTo then
      for i,res in ipairs(resultList) do
        -- might be local collections or from the context.
        addToCollections(self, context, block.addTo, res, command, cmdDef, args)
      end
    end
  end

  -- FIXME: do something with the ops.
  -- here put something in args for the 'as' field of 'resolve' ops.
  if cmdDef.ops then
    runOps(self, context, args, cmdDef.ops, command)
  end

  -- yield the result tuple or value.
  -- local yieldFrom = cmdDef.yieldFrom
  -- local cmdResult = yieldFrom and args[yieldFrom] or args -- tuple.
  local cmdResult = args -- tuple.

  -- bindToArg: add the command result to the parent tuple (e.g. 'block' directive)
  local bindToArg = cmdDef.bindToArg
  if bindToArg then
    local parentTuple = context.tuple or error(fmt("panic: bindToArg: not inside a parent command, in command %q", command))
    if parentTuple[bindToArg] ~= nil then
      parseError(fmt("more than one %q directive in command %q", command, context.command), self)
    end
    parentTuple[bindToArg] = cmdResult
  end

  if cmdDef.notIn then
    for i, name in ipairs(cmdDef.notIn) do
      local cdef, collection = resolveCollection(self, context, name, command, cmdDef, args)
      if cdef.key then
        -- index collection
        local key = cmdResult[cdef.key] or parseError(fmt("not-in collection: missing key %q in result tuple for collection %q in command %q", cdef.key, name, command), self)
        if collection[key] then
          -- parse error: key already exists in this 'add-to' collections.
          local msg = cdef['duplicate'] or fmt("duplicate key %q (field '{@key}') in collection '{@coll}' in '{@command}'", key)
          parseError(expand_text(msg, cmdResult, {['@command']=command,['@coll']=name,['@key']=cdef.key}), self)
        end
      else
        -- list-of collection
        -- TODO: check if a duplicate tuple is present?
        error(fmt("panic: not-in collection: collection %q is not an index, in command %q", name, command), self)
      end
    end
  end

  if cmdDef.addTo then
    -- cannot be local collections (cmd add-to always adds to context collections)
    addToCollections(self, context, cmdDef.addTo, cmdResult, command)
  end

  return cmdResult, false, start
end

parse_block = function (self, text, start, cmdMap, context)
  local result = {}
  local text_len = text:len()
  while start <= text_len do
    local res, ended
    res, ended, start = parse_command(self, text, start, cmdMap, context)
    if ended then
      break
    end
    if res ~= nil then
      result[#result+1] = res
    end
  end
  return result, start
end

local function parse(text, cmdSet, argSet, filename, collections)
  local self = { line=1, filename=filename, cmdSet=cmdSet, argSet=argSet }
  local cmdMap = cmdSet['@'] or error("missing top-level command set (commands @ is)")
  local context = new { colDefs={}, colObjs={}, tuple={}, command='@', canEnd=false, context=false }
  if collections then
    -- optional top-level collections for addTo in top-level commands.
    context.colDefs = collections
    for name, _ in pairs(collections) do
      local colObj = {}
      context.tuple[name] = colObj -- include in result tuple.
      context.colObjs[name] = colObj -- pass to top-level commands.
    end
  end
  context.tuple['is'] = (parse_block(self, text, 1, cmdMap, context))
  return context.tuple
end

return parse
