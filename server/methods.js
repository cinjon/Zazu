Meteor.methods({
  assign_geocode: function(location_id, i, lat, lng) {
    Locations.update({_id:location_id},
                     {$set:{'address.$i.coordinates':{'lat':lat, 'lng':lng}}});
  },

  add_access_to_location: function(location_id, access_name) {
    Locations.update({_id:location_id}, {$addToSet:{accessibility:access_name}});
  },

  add_category_input_to_location: function(location_id, field, value) {
    var update_query = {};
    update_query['category_specific_inputs.' + field] = value;
    Locations.update({_id:location_id}, {$set:update_query});
  },

  add_language_to_location: function(location_id, language) {
    Locations.update({_id:location_id}, {$addToSet:{languages:language}});
  },

  add_service_to_location: function(location_id, service_id) {
    //assuming service_id is a sub
    Locations.update({_id:location_id},
                     {$addToSet:{sub_service_ids:service_id}});
    Services.update({_id:service_id}, {$push:{locations:location_id}});
  },

  check_category_input_to_location: function(location_id, field, checked) {
    var update_query = {};
    update_query['category_specific_inputs.' + field] = checked;
    Locations.update({_id:location_id}, {$set:update_query});
  },

  flag_location: function(location_id, user_id) {
    var timestamp = (new Date()).getTime();
    var location = Locations.findOne({_id:location_id});
    flag_id = Flags.insert({
      created_time:timestamp, resource_id:location.resource_id,
      location_id:location_id, user_id:user_id, open:true, closed_time:null,
      county_id:location.service_area});
  },

  make_editor: function(user_id, username) {
    var timestamp = (new Date()).getTime();
    Roles.addUsersToRoles(user_id, ['editor']);
    var update_query = {};
    update_query['profiles.name'] = username;
    Meteor.users.update({_id:user_id}, {$set:update_query});
  },

  mark_complete: function(location_id, user_id) {
    var timestamp = (new Date()).getTime();
    Locations.update({_id:location_id}, {$set:{needs_edit:false}});
    Flags.update({location_id:location_id},
                 {$set:{closed_time:timestamp, open:false, user_id:user_id}})
    Changes.insert({target_location_id:location_id, marked_complete:true,
                    editor_id:user_id, created_time:timestamp});
  },

  remove_access_from_location: function(location_id, access_name) {
    Locations.update({_id:location_id}, {$pull:{accessibility:access_name}});

  },

  remove_category_input_from_location: function(location_id, field, value) {
    var update_query = {};
    update_query['category_specific_inputs.' + field] = value;
    Locations.update({_id:location_id}, {$pull:update_query});
  },

  remove_language_from_location: function(location_id, language) {
    Locations.update({_id:location_id}, {$pull:{languages:language}});
  },

  remove_service_from_location: function(location_id, service_id) {
    Locations.update({_id:location_id}, {$pull:{sub_service_ids:service_id}});
    Services.update({_id:service_id}, {$pull:{locations:location_id}});
  },

  save_location_edits: function(location_id, user_id, edits) {
    //TODO: fix to use new location architecture
    var failures = validate_edits(location_id, edits)
    if (failures.length == 1 && failures[0].key == 'kill') {
      return failures[0];
    } else {
      failures.forEach(function(failure) {
        delete edits[failure.key];
      });
    }

    //record all of the edits in the resource and the changelog
    var timestamp = (new Date()).getTime();

    if (location_id == null) { //new resource with location
      var phones = [make_phone(edits['phone_number_0'], edits['phone_hours_0'], 'voice')];
      var contacts = [make_contact(edits['contact_name'], edits['contact_title'])]
      var addresses = [];
      if ('city_0' in edits && 'zipcode_0' in edits && 'street_0' in edits) {
        addresses.push(make_address(edits['street_0'], edits['city_0'], 'CA',
                                    edits['zipcode_0'], null, null, null));
      }

      var resource_id = make_resource(edits['resource_name'], timestamp);
      var location_id = make_location(
        edits['location_name'],
        null,  //more_name_info
        contacts, edits['description'], edits['short_desc'],
        addresses, edits['hours'], edits['accessibility'],
        edits['languages'], edits['categories'], phones,
        edits['url'], edits['email'], edits['audience'], edits['eligibility'],
        edits['fees'], edits['how_to_apply'], edits['county'],
        edits['category_specific_inputs'], resource_id,
        true //needs_edit
      )

      Changes.insert({created_time:timestamp, target_resource_id:resource_id,
                      new_resource:true, editor_id:user_id});
      Resources.update({_id:resource_id}, {$addToSet:{locations:location_id}});
      Services.update({_id:{$in:edits['categories']}},
                      {$addToSet:{locations:location_id}});
      Changes.insert({created_time:timestamp, target_location_id:location_id,
                      new_location:true, editor_id:user_id});

      return {'resource_id':resource_id, 'location_id':location_id,
              success:"Thanks! Got it"}
    } else { //existing resource
      var location = Locations.findOne({_id:location_id});

      for (var field in edits) {
        if (field == 'hours') {
          var current = location.hours;
          var newvals = hours_adjusted_values(current, edits[field]);
          if (Object.keys(newvals).length > 0) {
            update_location(current, newvals, user_id, location_id, timestamp, 'hours', 'hours');
          }
        }

        var update_obj = {}; //TODO: make everything one big change like this one

        // if (field
        for (field in new_locations) {
          var value = new_locations[field];
          if (value !== resource.locations[field]) {
            resource_field_change(timestamp, resource_id, field, resource.locations[field],
                                  value, user_id);
            update_obj['locations.' + field] = value;
          }
        }
        for (field in new_names) {
          var value = new_names[field]
          if (value !== resource[field]) {
            resource_field_change(timestamp, resource_id, field, resource[field], value, user_id);
            update_obj[field] = value;
          }
        }
        for (field in edits['category_specific_inputs']) {
          var value = edits['category_specific_inputs'][field];
          if (!resource.category_specific_inputs || value !== resource.category_specific_inputs[field]) {
            if (resource.category_specific_inputs) {var oldval = resource.category_specific_inputs[field];}
            else {var oldval = null;}
            resource_field_change(timestamp, resource_id, field, oldval, value, user_id);
            update_obj['category_specific_inputs.' + field] = value;
          }
        }
        if (Object.keys(update_obj).length > 0) {
          set_update_resource_obj(resource_id, update_obj);
        }
        return {"success":true}
      }
    }
  }
});

var adjust_values_array = function(values, edits, slice_num) {
  for (var i = 0; i < edits.length; i++) {
    var index = parseInt(edits[i]['index'])
    for (var subkey in edits[i]) {
      if (subkey == 'index') {
        continue;
      }
      values[index][subkey.slice(slice_num)] = edits[i][subkey];
    }
  }
}

var closed_day = function(day) {
  return day && ('closed' in day) && day.closed;
}

var copy_array_with_obj = function(arr) {
  var copy = [];
  for (var i = 0; i < arr.length; i++) {
    copy.push({});
    var obj = arr[i];
    for (var key in obj) {
      copy[i][key] = obj[key];
    }
  }
  return copy;
}

var hours_adjusted_values = function(current, edits) {
  var values = {};
  for (var day in edits) {
    values[day] = {};
    var new_day_info = edits[day];
    var old_day_info = current[day];
    if (closed_day(new_day_info)) {
      if (!closed_day(old_day_info)) {
        values[day]['closed'] = true;
      } else {
        values[day] = current[day];
      }
    } else {
      var times = ['open_time', 'close_time'];
      times.forEach(function(time) {
        if (!old_day_info || !old_day_info[time]) {
          values[day][time] = new_day_info[time];
        } else {
          values[day][time] = get_valid_time(new_day_info[time],
                                             old_day_info[time]);
        }
      });
    }
  }
  return values;
}

var edits_or_current = function(edit, current, key) {
  return edit || current[key];
}

var get_valid_time = function(new_time, old_time) {
  //already validated that it fit hte regex or was ''
  if (new_time && !(new_time == '') && !(new_time == 'Blank')) {
    return new_time;
  }
  return old_time;
}

var update_location = function(oldvals, newvals, editor_id, location_id, ts, field, update_string) {
  if (!_.isEqual(oldvals, newvals)) {
    location_field_change(ts, location_id, field, oldvals, newvals, editor_id);
    set_update_location_with_str(location_id, update_string, newvals);
  }
}

var all_required_msg = 'Error: Missing a required field (name, address, contact info, descriptions)'

var is_placeholder_value = function(value, placeholder) {
  return value == '' || value == placeholder
}

var validate_edits = function(location_id, edits) {
  var failures = [];
  if (!location_id) {
    if (!('categories' in edits)) {
      return [{
        success:false, key:'kill',
        message:'Error: Please include at least one category'
      }]
    }
    for (var i = 0; i < required_fields.length; i++) {
      field = required_fields[i];
      if (!(field in edits)) {
        return [{success:false, message:all_required_msg, key:'kill'}]
      }
    }
  }

  if ('zipcode_0' in edits) {
    var val = edits['zipcode_0'];
    if (val != '' && val != 'Zip' && !(/^\d{5}$/.test(edits['zipcode_0']))) {
      failures.push({'success':false, message:'Warning: Zipcode malformed, not updating address', key:'zipcode_0'});
    }
  }

  if ('hours' in edits) {
    var hours = validate_hours(edits['hours']);
    if (!hours['success']) {
      failures.push(hours);
    }
  }
  return failures;
}

var validate_hours = function(hours) {
  for (var day in hours) {
    var input = hours[day];
    if (input.closed) {
      continue;
    }

    //we want either both open and close to be real times OR
    //we want both to be blank values.
    var open_military = validate_time(input['open_time']);
    var close_military = validate_time(input['close_time']);
    if (open_military && close_military) {
      if (close_military < open_military) {
        return {'success':false,
                'message':"Warning: " + display_day(day) + "'s closing time is earlier than it's opening time. Not setting hours.",
                'key':'hours'}
      }
    } else if (!(is_placeholder_value(input['open_time'], 'Blank') && is_placeholder_value(input['close_time'], 'Blank'))) {
      return {'success':false,
              'message':"Warning: " + display_day(day) + ' is not in correct military time. Not setting hours.',
              'key':'hours'}
    }
  }
  return {'success':true}
}

var validate_time = function(time) {
  if (/^[0-2]\d[0-5]\d$/.test(time) && parseInt(time) < 2400) {
    return time;
  } else {
    return false;
  }
}