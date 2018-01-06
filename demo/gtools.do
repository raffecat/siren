cmd-set @ is
  cmd scene is
    arg background of number
    arg camera of enum with ui
    arg mouse of enum with show, hide
    block is cmds scene-cmds with layers, slots, slot-ids, str-consts, scripts
    list-of layers as layers
    list-of slots as slots
    index slot-ids on id is
      duplicate "duplicate slot id '{id}' in scene"
    end
    index scripts on id is
      duplicate "duplicate script id '{id}' in scene"
    end
    index str-consts on text is
      generate-id id from "str-{count}" not-in slot-ids -- FIXME: temp-slots
    end
    -- view-of-list public-slots from slots with public=true
  end
end

-- these commands might make more sense as 'tuple' cmds, since they yield tuples.
-- should commands be in sets, or should they be flat with multiple tags?
-- BUT they are 'cmd' because they match commands in the input text.
-- BUT they are 'tuple' because they make tuples (and everything is a command!)

cmd-set scene-cmds is
  cmd slot add-to slot-ids, slots is
    arg id of word direct
    arg type of word required
    arg name of text
    arg text of text
    arg new of enum with map
    arg public of flag
    arg value of number
  end
  cmd layer add-to layers is
    arg id of word direct
    arg name of text required
    arg mode of enum with ui
    arg visible of flag
    arg locked of flag
    block is cmds layer-cmds with frame-ids, slot-ids, str-consts, scripts add-to frames, frame-ids
    list-of frames
    index frame-ids on id is
      duplicate "duplicate frame id '{id}' in scene"
    end
  end
  cmd script add-to scripts is
    arg id of word alias script-id direct
    arg name of text required
    block is cmds action-cmds add-to actions with layers, slot-ids, str-consts, scripts, temp-slots
    list-of actions
    index temp-slots on id is
      assert id not-in slot-ids or "temporary name '{id}' conflicts with a scene-slot name, in script {script-id}"
      merge-on type or "cannot re-use the temporary '{id}' with a different type, in script {script-id}"
      duplicate "cannot re-use the temporary '{id}' in script {script-id}"
    end
  end
end

cmd-set layer-cmds is
  cmd frame is
    arg id of word direct
    arg left of slot-and-ofs required
    arg top of slot-and-ofs required
    arg right of slot-and-ofs required
    arg bottom of slot-and-ofs required
    block is cmds layer-cmds with frame-ids, slot-ids, scripts add-to frames, frame-ids
    list-of frames
  end
  cmd image-frame is
    arg id of word direct
    arg asset of word required
    arg shape of word
    arg left of slot-and-ofs required
    arg top of slot-and-ofs required
  end
  cmd nine-patch is
    arg id of word direct
    arg asset of word required
    arg shape of word required
    arg left of slot-and-ofs required
    arg top of slot-and-ofs required
    arg right of slot-and-ofs required
    arg bottom of slot-and-ofs required
  end
  cmd frame-host is
    arg id of word direct
    arg panel of word required
    arg left of slot-and-ofs required
    arg top of slot-and-ofs required
    arg right of slot-and-ofs required
    arg bottom of slot-and-ofs required
  end
  cmd tab-strip is
    arg id of word direct
    arg of of word required
    arg left of slot-and-ofs required
    arg top of slot-and-ofs required
    arg right of slot-and-ofs required
    arg bottom of slot-and-ofs required
    block is cmds tab-strip-cmds add-to tabs
    list-of tabs
  end
  cmd use-frame is
    arg id of word direct
    arg part of word required
    arg left of slot-and-ofs required
    arg top of slot-and-ofs required
    arg right of slot-and-ofs required
    arg bottom of slot-and-ofs required
  end
end

cmd-set tab-strip-cmds is
  cmd tab is
    arg id of word direct
    arg width of number required
    arg label of text required
    arg spawn of word
    arg with of key-value-map -- required if spawn
  end
end

-- for these tuple-defs, the inner commands declare parsing steps, mostly.
-- but this is essentially what commands do already, 
-- and cmd could also support 'from [field]' and 'yield' [field-set]
-- so these are commands used to parse one argument value.
-- NB. these [appear to] access collections visible only to the caller.
-- NB. these generate a local tuple, then yield it, or from it.

-- 1. parsing pattern (ws, expect, number, quoted, alpha|num|set)
-- 2. lines, alt patterns, keyword alts
-- 3. index tuples, resolve in index

pattern menu-index is
  arg menu of number direct
  expect ":"
  arg index of number direct
end
pattern slot-and-ofs is
  arg slot of num-slot direct -- TODO: anchor or num-slot ?
  match "+" one-of pm is
    arg ofs of number direct
  end
  match "-" one-of pm is
    arg ofs of number direct yield (-ofs)
    -- TODO: negate ofs
  end
end

pattern as-temp-inst from slot is -- not deferred
  arg id of word direct
  assert id not-in slot-ids or "temp-slot '{id}' cannot shadow a local slot name"
  resolve id in temp-slots as slot insert id=id, type=inst
  assert slot.type is-sym inst or "temporary '{id}' used for type 'inst' already has type '{slot.type}'"
end
pattern as-temp-str from slot is -- not deferred
  arg id of word direct
  assert id not-in slot-ids or "temp-slot '{id}' cannot shadow a local slot name"
  resolve id in temp-slots as slot insert id=id, type=str
  assert slot.type is-sym str or "temporary '{id}' used for type 'str' already has type '{slot.type}'"
end

-- this introduces parameters (knowns) to patterns, so that one pattern can be used
-- to recognise a whole class of similar patterns. cmds are actually patterns as well,
-- but patterns that match a whole line, and can contain 'is' blocks that allow a
-- specific set of cmds to match.

pattern slot-of-type [#type] form slot is
  arg id of word direct
  resolve id in slot-ids as slot or "slot '{id}' is not a local slot name" -- depends on slot-ids
  assert slot.type is-sym #type or "local slot '{id}' is of type '{slot.type}' and cannot be used for type '{#type}'" -- depends on slot (after slot-ids)
end
pattern str-slot from slot is
  arg slot of slot-of-type [str] direct
end

pattern str-slot from slot is -- depends on slot
  arg id of word direct
  resolve id in slot-ids as slot or "slot '{id}' is not a local slot name" -- depends on slot-ids
  assert slot.type is-sym str or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'str'" -- depends on slot (after slot-ids)
end
pattern int-slot from slot is -- depends on slot
  arg id of word direct
  resolve id in slot-ids as slot or "slot '{id}' is not a local slot name" -- depends on slot-ids
  assert slot.type is-sym int or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'int'" -- depends on slot (after slot-ids)
end
pattern num-slot from slot is -- depends on slot
  arg id of word direct
  resolve id in slot-ids as slot or "slot '{id}' is not a local slot name" -- depends on slot-ids
  assert slot.type is-sym num or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'num'" -- depends on slot (after slot-ids)
end
pattern inst-slot from slot is -- depends on slot
  arg id of word direct
  resolve id in slot-ids as slot or "slot '{id}' is not a local slot name" -- depends on slot-ids
  assert slot.type is-sym inst or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'inst'" -- depends on slot (after slot-ids)
end

pattern str-ref from slot is
  match-token text one-of opts is -- local namespace for one-of.
    arg value of text direct
    resolve text in str-consts as slot insert text=value -- text is the index key.
  end
  match-token word one-of opts is
    arg id of word direct
    resolve id in slot-ids, temp-slots as slot or "reference to '{id}' is not a local slot name or temporary" -- deferred on slot-ids AND temp-slots.
    assert slot.type is-sym str or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'str'" -- depends on slot (after slot-ids)
  end
end
pattern inst-ref from slot is
  arg id of word direct
  resolve id in slot-ids, temp-slots as slot or "reference to '{id}' is not a local slot name or temporary" -- deferred on slot-ids AND temp-slots.
  assert slot.type is-sym inst or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'inst'" -- depends on slot (after slot-ids)
end
pattern data-ref from slot is
  arg id of word direct
  resolve id in slot-ids, temp-slots as slot or "reference to '{id}' is not a local slot name or temporary" -- deferred on slot-ids AND temp-slots.
  assert slot.type is-sym data or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'data'" -- depends on slot (after slot-ids)
end
pattern group-ref from slot is
  arg id of word direct
  resolve id in slot-ids, temp-slots as slot or "reference to '{id}' is not a local slot name or temporary" -- deferred on slot-ids AND temp-slots.
  assert slot.type is-sym group or "local slot '{id}' is of type '{slot.type}' and cannot be used for type 'group'" -- depends on slot (after slot-ids)
end
pattern tpl-ref is
  arg id of word direct
end

pattern read-slots-map from list is
  match-list as list is
    arg src of word direct
    resolve src in tpl.public-slots as src-slot
    match "as" one-of opts is
      -- it would be good if the temp-slots collection captured the constraints:
      -- assert not-in slot-ids and assert same type for id, or new temp-slot.
      -- also provide error messages for these cases in one place.
      arg dest of word direct
      resolve dest in temp-slots as dest-slot insert type=src-slot.type
      assert dest-slot.type is-eq src-slot.type or "local temporary '{dest}' does not match the type of the source slot '{src}' from '{tpl.id}' (local temporary is '{dest-slot.type}' vs '{src-slot.type}')"
      -- ideally the collection would already know the type (slot) to be inserted.
    end
    match "to" one-of opts is
      arg dest of word direct
      resolve dest in slot-ids as dest-slot
      assert dest-slot.type is-eq src-slot.type or "local slot '{dest}' does not match the type of the source slot '{src}' from '{tpl.id}' (local slot is '{dest-slot.type}' vs '{src-slot.type}')"
    end
  end
end

pattern write-slots-map from list is
  match-list as list is
    arg dest of word direct
    resolve dest in tpl.public-slots as dest-slot
    expect "="
    arg src of word direct
    resolve src in slot-ids, temp-slots as src-slot
    assert src-slot.type is-eq dest-slot.type or "destination slot '{dest}' in '{tpl.id}' does not match the type of the local slot '{src}' ('{dest-slot.type}' vs '{src-slot.type}')"
  end
end

pattern word-or-text from value is
  match-token text one-of opts is
    arg value of text direct
  end
  match-token word one-of opts is
    arg value of word direct
  end
end

pattern read-data-map from list is
  match-list as list is
    arg src of word-or-text direct
    arg type of enum with bool, num, str, list, obj direct
    map-sym type as src-type with bool=num, num=num, str=str, list=data, obj=data
    match "as" one-of opts is
      arg dest of word direct
      resolve dest in temp-slots as dest-slot insert type=type
      assert dest-slot.type is-eq type or "local temporary '{dest}' does not match the type '{type}' of the source data (local temporary is '{dest-slot.type}')"
    end
    match "to" one-of opts is
      arg dest of word direct
      resolve dest in slot-ids as dest-slot
      assert dest-slot.type is-eq type or "local slot '{dest}' does not match the type '{type}' of the source data (local slot is '{dest-slot.type}')"
    end
  end
end

-- for these cmd-defs, the inner commands declare arguments and resolve steps,
-- which are declarative (resolve steps are performed in topological order)

-- there's no point just parsing stuff and making Lua do the rest later;
-- collections, filtered views, merge/conflict rules, resolve-in, assertions, etc.

-- named command
-- one argument per line, with options (required, unless, enum etc)
-- block option
-- collections, resolve (transform phase? but commands need to _do_ something)

-- why not use read-data-map _as_ the arg command?
-- ^ because 'arg' means tuple-field and has direct|required options.

cmd-set action-cmds is
  cmd this-ref is
    arg as of as-temp-inst required
  end
  cmd add-menu is
    arg menu of number direct
    arg name of str-ref required
  end
  cmd add-menu-sep is
    arg menu of menu-index direct
  end
  cmd add-menu-item is
    arg menu of menu-index direct
    arg name of str-ref required
    arg entry of word
    arg key of text
    arg command of flag
    arg option of flag
    arg shift of flag
    resolve entry in scripts or "entry '{id}' not found in this scene"
  end
  cmd format-text is
    arg fmt of text direct -- TODO: of text-template
    arg as of as-temp-str unless to
    arg to of str-slot unless as
  end
  cmd read-json is
    arg filename of str-ref direct
    arg as of as-temp-str unless to
    arg to of str-slot unless as
  end
  cmd read-from is
    arg from of inst-ref direct
    arg of of tpl-ref as tpl required
    -- comma separated list of its sub-command tuples:
    arg read of read-slots-map required
  end
  cmd write-to is
    arg to of inst-ref direct
    arg of of tpl-ref as tpl required
    arg write of write-slots-map required -- TODO: need to resolve the pairs.
  end
  cmd read-from-data is
    arg from of data-ref direct
    arg read of read-data-map required -- TODO: need types -> write to temps or slots.
  end
  cmd write-to-data is
    arg to of data-ref direct
    arg write of key-value-map required -- TODO: need data types <- read from temps or slots.
  end
  cmd assert-ref is
    arg slot of inst-ref direct
    arg or of text required
  end
  cmd each-data is
    arg slot of data-ref direct
    arg as of as-temp-data required
    block do cmds action-cmds add-to actions with slot-ids, scripts, temp-slots, str-consts
    list-of actions
  end
  cmd add-counter is
    arg slot of int-slot direct
    arg add of number required
  end
  cmd spawn is
    arg tpl of tpl-ref direct
    arg into of group-ref as group
    arg as of as-temp-inst
    arg to of inst-slot
    arg with of write-slots-map as args
  end
  cmd spawn-frame is
    arg tpl of tpl-ref direct
    arg into of group-ref as group
    arg as of as-temp-inst
    arg to of inst-slot
    arg with of write-slots-map as args
  end
  cmd if is
    -- FIXME: modular conditions require [recursive] args from a cmd-set...
    arg condition of word direct
    arg key of number -- for 'key-was-pressed'
    arg in of word -- for 'no-inst'
    block do cmds action-cmds add-to actions with slot-ids, scripts, temp-slots, str-consts
    list-of actions
  end
  cmd do-entry is
    arg entry of word direct
    arg in of inst-ref as inst
    arg of of tpl-ref as tpl
    resolve entry in tpl.scripts or "entry '{id}' not found in template '{tpl.id}'"
  end
  cmd choose-files is
    arg dir of str-ref direct
    arg as of as-temp-str required
    block do cmds action-cmds add-to actions with slot-ids, scripts, temp-slots, str-consts
    list-of actions
  end
  cmd queue-inst is
    arg inst of word direct
    arg for of enum-set as bits with dirty
  end
  cmd copy-text is
    arg from of word direct
    arg to of word required
  end

end
